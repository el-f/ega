import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config';
import { AntiLoop } from './anti-loop';
import { BROWSER_TOOL_DEFS, dispatchBrowserTool, type BrowserContextRef } from './tools/browser';
import { STORAGE_TOOL_DEFS, dispatchStorageTool } from './tools/storage';
import { AUDIT_TOOL_DEFS, dispatchAuditTool } from './tools/audit';
import { ASSERT_TOOL_DEFS, dispatchAssertTool, type AssertResult } from './tools/assert';
import { loadGoal } from './prompt/goal';

interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: readonly string[];
  };
}

const ALL_TOOL_DEFS: readonly ToolDef[] = [
  ...BROWSER_TOOL_DEFS,
  ...STORAGE_TOOL_DEFS,
  ...AUDIT_TOOL_DEFS,
  ...ASSERT_TOOL_DEFS,
];

export type SessionOutcomeName = 'bug-found' | 'no_bug_found' | 'no_progress' | 'budget_exhausted';

export interface RecipeStepRecord {
  tool: string;
  input: Record<string, unknown>;
  result: unknown;
}

export interface SessionOutcome {
  outcome: SessionOutcomeName;
  steps: number;
  findings: AssertResult[];
  recipe: ReadonlyArray<RecipeStepRecord>;
}

// The Anthropic client surface we use, so tests can pass a fake; `body` is unknown because the SDK overloads on stream.
export interface AnthropicLike {
  messages: {
    create: (body: unknown) => Promise<Message>;
  };
}

export interface RunSessionOptions {
  goalId: string;
  ref: BrowserContextRef;
  sessionDir: string;
  client?: AnthropicLike;
}

function isToolUseBlock(
  b: Message['content'][number],
): b is Extract<Message['content'][number], { type: 'tool_use' }> {
  return b.type === 'tool_use';
}

async function dispatchToolCall(
  ref: BrowserContextRef,
  name: string,
  input: Record<string, unknown>,
): Promise<{ result: unknown; assertFinding?: AssertResult }> {
  if (name.startsWith('browser_')) {
    const r = await dispatchBrowserTool(ref, name, input);
    return { result: r };
  }
  if (name.startsWith('storage_')) {
    const r = await dispatchStorageTool(ref, name, input);
    return { result: r };
  }
  if (name === 'audit_read') {
    const r = await dispatchAuditTool(ref, name);
    return { result: r };
  }
  if (name === 'assert') {
    const r = await dispatchAssertTool(ref, name, input);
    if (r.ok && !r.result.passed) {
      return { result: r, assertFinding: r.result };
    }
    return { result: r };
  }
  return { result: { ok: false, error: `unknown tool ${name}` } };
}

function wrapAnthropic(real: Anthropic): AnthropicLike {
  return {
    messages: {
      create: async (body: unknown) => {
        // The SDK's create() is variadic-overloaded on stream:true|false; the
        // mock surface takes a single unknown body so we cast at the boundary.
        const result = await real.messages.create(
          body as Parameters<Anthropic['messages']['create']>[0],
        );
        // Non-streaming returns Message directly; if the agent ever passes
        // stream:true the cast surfaces immediately at runtime.
        return result as Message;
      },
    },
  };
}

export async function runSession(opts: RunSessionOptions): Promise<SessionOutcome> {
  const client: AnthropicLike =
    opts.client ?? wrapAnthropic(new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] ?? '' }));
  const goal = await loadGoal(opts.goalId);
  const systemTemplate = await fs.readFile(
    path.resolve('tests/explore/agent/prompt/system.md'),
    'utf-8',
  );
  const toolSummary = JSON.stringify(
    ALL_TOOL_DEFS.map((t) => ({ name: t.name, description: t.description })),
    null,
    2,
  );
  const system = systemTemplate.replace('{{tools}}', toolSummary);

  const messages: MessageParam[] = [{ role: 'user', content: goal.body }];
  const recipe: RecipeStepRecord[] = [];
  const findings: AssertResult[] = [];
  const antiLoop = new AntiLoop({
    window: CONFIG.antiLoopWindow,
    threshold: CONFIG.antiLoopThreshold,
  });
  await fs.mkdir(opts.sessionDir, { recursive: true });
  const transcriptPath = path.join(opts.sessionDir, 'transcript.jsonl');

  // The SDK takes a mutable ToolUnion[], so copy the readonly defs.
  const tools: Tool[] = [...ALL_TOOL_DEFS] as Tool[];

  let steps = 0;
  while (steps < CONFIG.stepBudget) {
    const resp = await client.messages.create({
      model: CONFIG.model.plan,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });
    await fs.appendFile(
      transcriptPath,
      JSON.stringify({ kind: 'assistant', stopReason: resp.stop_reason, content: resp.content }) +
        '\n',
    );

    const toolUses = resp.content.filter(isToolUseBlock);

    if (toolUses.length === 0) {
      return {
        outcome: findings.length > 0 ? 'bug-found' : 'no_bug_found',
        steps,
        findings,
        recipe,
      };
    }

    const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
    for (const tu of toolUses) {
      const input: Record<string, unknown> =
        tu.input !== null && typeof tu.input === 'object'
          ? (tu.input as Record<string, unknown>)
          : {};
      const { result, assertFinding } = await dispatchToolCall(opts.ref, tu.name, input);
      if (assertFinding) findings.push(assertFinding);
      recipe.push({ tool: tu.name, input, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result).slice(0, 4_000),
      });
      await fs.appendFile(
        transcriptPath,
        JSON.stringify({ kind: 'tool', name: tu.name, input, result }) + '\n',
      );

      if (antiLoop.record({ tool: tu.name, input })) {
        return { outcome: 'no_progress', steps, findings, recipe };
      }
    }

    messages.push({ role: 'assistant', content: resp.content });
    messages.push({ role: 'user', content: toolResults });
    steps += 1;
  }
  return { outcome: 'budget_exhausted', steps, findings, recipe };
}
