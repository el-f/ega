import { describe, it, expect } from 'vitest';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { sel } from '@tests/_helpers/lang';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { parseJsonResponse, type TranslateCallArgs } from '@/shared/backends/base';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslationChunk } from '@/shared/types';
import { claudeFrameHasToolUse, parseClaudeFrame } from '../../native-host/lib/protocol-claude.mjs';

// Hand-written minimal vendor streams: they pin the parser wiring, not vendor wire drift.

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = (name: string): string => join(__dirname, '..', 'fixtures', name);

const baseConfig = {
  apiKeys: { anthropic: 'sk-ant-test', openai: 'sk-test' },
  model: {
    anthropic: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4o-mini',
    gemini: 'gemini-1.5-flash',
    groq: 'llama-3.3-70b-versatile',
    deepseek: 'deepseek-chat',
    together: '',
    mistral: '',
    xai: '',
    fireworks: '',
    openrouter: '',
    ollama: 'llama3.2',
    native: '',
  },
  advanced: {
    promptTemplate: { system: 's', user: 'u' },
    perPresetTemplates: {},
    temperature: 0.2,
    maxTokens: 1024,
  },
};

function mkArgs(onChunk: (c: TranslationChunk) => void): TranslateCallArgs {
  return {
    req: {
      id: 'fixture-1',
      text: 'hello',
      sourceLang: sel('arabizi'),
      targetLang: sel('en'),
      options: { stream: true, explain: false },
    },
    system: 'SYS',
    user: 'USER',
    stream: true,
    cancel: noopCancel(),
    onChunk,
    config: baseConfig,
  };
}

function sseResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('backend contracts against captured fixtures', () => {
  it('AnthropicBackend streams the real v1/messages SSE shape', async () => {
    const body = readFileSync(fixturePath('anthropic-sse-stream.txt'), 'utf8');
    setFetchHandler(async () => sseResponse(body));

    const chunks: TranslationChunk[] = [];
    await new AnthropicBackend().translate(mkArgs((c) => chunks.push(c)));

    const deltas = chunks.filter((c) => c.type === 'delta');
    const done = chunks.find((c) => c.type === 'done');

    expect(deltas.length).toBeGreaterThanOrEqual(2);

    expect(done).toBeDefined();
    if (done?.type === 'done') {
      expect(done.confidence).toBeCloseTo(0.91, 1);
    }

    const joined = deltas.map((d) => d.text).join('');
    const parsed = parseJsonResponse(joined);
    expect(parsed.translation).toBe('hello world');
    expect(parsed.confidence).toBeCloseTo(0.91, 2);
  });

  it('the openai compat backend streams the real chat/completions SSE shape', async () => {
    const body = readFileSync(fixturePath('openai-sse-stream.txt'), 'utf8');
    setFetchHandler(async () => sseResponse(body));

    const chunks: TranslationChunk[] = [];
    await makeOpenAICompatBackend('openai').translate(mkArgs((c) => chunks.push(c)));

    const deltas = chunks.filter((c) => c.type === 'delta');
    const done = chunks.find((c) => c.type === 'done');

    expect(deltas.length).toBeGreaterThanOrEqual(2);
    expect(done).toBeDefined();
    if (done?.type === 'done') {
      expect(done.confidence).toBeCloseTo(0.88, 1);
    }

    const joined = deltas.map((d) => d.text).join('');
    const parsed = parseJsonResponse(joined);
    expect(parsed.translation).toBe('bonjour');
    expect(parsed.confidence).toBeCloseTo(0.88, 2);
  });

  it('native host parseClaudeFrame extracts text from the real stream-json JSONL', () => {
    const body = readFileSync(fixturePath('claude-verbose-stream.jsonl'), 'utf8');
    const lines = body.split('\n').filter((l) => l.trim().length > 0);

    const extracted: string[] = [];
    for (const line of lines) {
      const event = parseClaudeFrame(JSON.parse(line) as unknown);
      if (event?.kind === 'delta') extracted.push(event.text);
    }

    // Only the assistant block counts: a result frame repeats the final text and would double it.
    expect(extracted).toHaveLength(1);
    const payload = extracted[0];
    if (payload === undefined) throw new Error('expected a payload');
    const parsed = parseJsonResponse(payload);
    expect(parsed.translation).toBe('Welcome, how are you?');
    expect(parsed.confidence).toBeCloseTo(0.93, 2);
    expect(parsed.detectedLang).toBe('arabizi');
  });

  it('claudeFrameHasToolUse flags tool_use frames so the host can surface them', () => {
    const frame = {
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'WebSearch', input: { query: 'x' } }],
      },
    };
    expect(claudeFrameHasToolUse(frame)).toBe(true);
    expect(
      claudeFrameHasToolUse({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hi' }] },
      }),
    ).toBe(false);
    expect(claudeFrameHasToolUse(null)).toBe(false);
    expect(claudeFrameHasToolUse(42)).toBe(false);
  });
});
