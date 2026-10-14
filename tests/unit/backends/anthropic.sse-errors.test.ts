import { describe, it, expect } from 'vitest';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { setFetchHandler } from '@tests/mocks/fetch';
import { sel } from '@tests/_helpers/lang';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

// Error paths (401, 429, malformed SSE, fetch rejection); the happy path lives in anthropic.test.ts.

const baseConfig = {
  apiKeys: { anthropic: 'sk-ant-test' },
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
    localserver: '',
    native: '',
  },
  advanced: {
    promptTemplate: { system: 's', user: 'u' },
    perPresetTemplates: {},
    temperature: 0.2,
    maxTokens: 1024,
  },
};

const mkArgs = (over: Partial<TranslateCallArgs> = {}): TranslateCallArgs => ({
  req: {
    id: 'r1',
    text: 'hi',
    sourceLang: sel('arabizi'),
    targetLang: sel('en'),
    options: { stream: true, explain: false },
  },
  system: 'SYS',
  user: 'USER',
  stream: true,
  cancel: noopCancel(),
  onChunk: () => {},
  config: baseConfig,
  ...over,
});

describe('AnthropicBackend SSE error paths', () => {
  it('emits AUTH error on 401', async () => {
    setFetchHandler(async () => new Response('{"error":"unauthorized"}', { status: 401 }));
    const chunks: TranslationChunk[] = [];
    await new AnthropicBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    expect(chunks.find((c) => c.type === 'error' && c.code === 'AUTH')).toBeDefined();
  });

  it('emits RATE_LIMIT on 429', async () => {
    setFetchHandler(async () => new Response('rate-limited', { status: 429 }));
    const chunks: TranslationChunk[] = [];
    await new AnthropicBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    expect(chunks.find((c) => c.type === 'error' && c.code === 'RATE_LIMIT')).toBeDefined();
  });

  it('handles a malformed SSE body without throwing (stream completes)', async () => {
    // SSE-shaped body with no deltas and no message_stop: it must end cleanly, never as an unhandled rejection.
    const body = 'event: unknown\ndata: not-json-at-all\n\ndata: {"no":"delta":"here"}\n\n';
    setFetchHandler(
      async () =>
        new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const chunks: TranslationChunk[] = [];
    await new AnthropicBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    // Either we got a done with empty content or an error — both are acceptable
    // "graceful" outcomes; the assertion is that we didn't throw.
    const doneOrError = chunks.find((c) => c.type === 'done' || c.type === 'error');
    expect(doneOrError).toBeDefined();
  });

  it('emits NETWORK error when fetch rejects', async () => {
    setFetchHandler(async () => {
      throw new TypeError('offline');
    });
    const chunks: TranslationChunk[] = [];
    await new AnthropicBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') expect(err.code).toBe('NETWORK');
  });
});
