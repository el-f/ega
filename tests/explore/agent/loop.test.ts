import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { BrowserContext, Page } from '@playwright/test';
import type { Message } from '@anthropic-ai/sdk/resources/messages';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runSession, type AnthropicLike } from './loop';

function tmp(name: string): string {
  return path.join(
    os.tmpdir(),
    `explore-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}

interface MockPage {
  evaluate: Mock;
  click: Mock;
  fill: Mock;
  waitForSelector: Mock;
  waitForTimeout: Mock;
  goto: Mock;
  getByRole: Mock;
}

function makePage(): MockPage {
  return {
    evaluate: vi.fn(async () => ''),
    click: vi.fn(async () => undefined),
    fill: vi.fn(async () => undefined),
    waitForSelector: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    goto: vi.fn(async () => undefined),
    getByRole: vi.fn(() => ({ click: vi.fn(async () => undefined) })),
  };
}

function makeMessage(
  content: Message['content'],
  stopReason: Message['stop_reason'] = 'end_turn',
): Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    container: null,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      cache_creation: null,
      service_tier: null,
    },
  } as unknown as Message;
}

async function withTempGoal(id: string, body: string, fn: () => Promise<void>): Promise<void> {
  const goalDir = path.resolve('tests/explore/goals');
  await fs.mkdir(goalDir, { recursive: true });
  const file = path.join(goalDir, `${id}.md`);
  await fs.writeFile(file, body);
  try {
    await fn();
  } finally {
    await fs.rm(file, { force: true });
  }
}

describe('runSession (mocked client)', () => {
  it('records no_bug_found when agent emits text only', async () => {
    const fakeClient: AnthropicLike = {
      messages: {
        create: vi.fn(async () =>
          makeMessage([
            { type: 'text', text: 'I am done', citations: null },
          ] as unknown as Message['content']),
        ),
      },
    };
    const sessionDir = tmp('noop');
    const page = makePage();

    await withTempGoal('test-noop', 'no-op goal', async () => {
      const res = await runSession({
        goalId: 'test-noop',
        ref: { context: {} as BrowserContext, page: page as unknown as Page },
        client: fakeClient,
        sessionDir,
      });
      expect(res.outcome).toBe('no_bug_found');
      expect(res.steps).toBe(0);
    });

    await fs.rm(sessionDir, { recursive: true, force: true });
  });

  it('records bug-found when assert tool reports passed=false', async () => {
    let call = 0;
    const fakeClient: AnthropicLike = {
      messages: {
        create: vi.fn(async () => {
          call += 1;
          if (call === 1) {
            return makeMessage(
              [
                {
                  type: 'tool_use',
                  id: 'tu_1',
                  name: 'assert',
                  input: { predicate: 'false', claim: 'always false' },
                  caller: { type: 'direct' },
                },
              ] as unknown as Message['content'],
              'tool_use',
            );
          }
          return makeMessage([
            { type: 'text', text: 'done', citations: null },
          ] as unknown as Message['content']);
        }),
      },
    };
    const sessionDir = tmp('bug');
    const page = makePage();
    // assert tool routes through page.evaluate; force it to evaluate the predicate as falsy
    page.evaluate.mockResolvedValueOnce(0);

    await withTempGoal('test-bug', 'find a bug', async () => {
      const res = await runSession({
        goalId: 'test-bug',
        ref: { context: {} as BrowserContext, page: page as unknown as Page },
        client: fakeClient,
        sessionDir,
      });
      expect(res.outcome).toBe('bug-found');
      expect(res.findings).toHaveLength(1);
      expect(res.findings[0]?.claim).toBe('always false');
    });

    await fs.rm(sessionDir, { recursive: true, force: true });
  });

  it('records no_progress when the agent repeats identical tool calls', async () => {
    const fakeClient: AnthropicLike = {
      messages: {
        create: vi.fn(async () =>
          makeMessage(
            [
              {
                type: 'tool_use',
                id: 'tu_loop',
                name: 'browser_click',
                input: { selector: 'button' },
                caller: { type: 'direct' },
              },
            ] as unknown as Message['content'],
            'tool_use',
          ),
        ),
      },
    };
    const sessionDir = tmp('loop');
    const page = makePage();

    await withTempGoal('test-loop', 'will loop forever', async () => {
      const res = await runSession({
        goalId: 'test-loop',
        ref: { context: {} as BrowserContext, page: page as unknown as Page },
        client: fakeClient,
        sessionDir,
      });
      expect(res.outcome).toBe('no_progress');
    });

    await fs.rm(sessionDir, { recursive: true, force: true });
  });

  it('writes transcript.jsonl into the session directory', async () => {
    const fakeClient: AnthropicLike = {
      messages: {
        create: vi.fn(async () =>
          makeMessage([
            { type: 'text', text: 'done', citations: null },
          ] as unknown as Message['content']),
        ),
      },
    };
    const sessionDir = tmp('transcript');
    const page = makePage();

    await withTempGoal('test-transcript', 'no-op', async () => {
      await runSession({
        goalId: 'test-transcript',
        ref: { context: {} as BrowserContext, page: page as unknown as Page },
        client: fakeClient,
        sessionDir,
      });
      const transcript = await fs.readFile(path.join(sessionDir, 'transcript.jsonl'), 'utf-8');
      expect(transcript).toContain('"kind":"assistant"');
    });

    await fs.rm(sessionDir, { recursive: true, force: true });
  });
});
