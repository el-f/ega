import { describe, it, expect } from 'vitest';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { sel } from '@tests/_helpers/lang';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

// PARSE + NETWORK coverage for OpenAI. AUTH/RATE_LIMIT
// already covered in openai.test.ts.

const baseConfig = {
  apiKeys: { openai: 'sk-test' },
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

const mkArgs = (over: Partial<TranslateCallArgs> = {}): TranslateCallArgs => ({
  req: {
    id: 'r1',
    text: 'hi',
    sourceLang: sel('genz-slang'),
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

describe('openai (openai-compat) SSE error paths', () => {
  it('emits AUTH on 401', async () => {
    setFetchHandler(async () => new Response('unauthorized', { status: 401 }));
    const chunks: TranslationChunk[] = [];
    await makeOpenAICompatBackend('openai').translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    expect(chunks.find((c) => c.type === 'error' && c.code === 'AUTH')).toBeDefined();
  });

  it('emits RATE_LIMIT on 429', async () => {
    setFetchHandler(async () => new Response('slow down', { status: 429 }));
    const chunks: TranslationChunk[] = [];
    await makeOpenAICompatBackend('openai').translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    expect(chunks.find((c) => c.type === 'error' && c.code === 'RATE_LIMIT')).toBeDefined();
  });

  it('does not throw on malformed SSE content', async () => {
    // Non-JSON data lines: the backend must not throw and must end with done or an error chunk.
    const body = 'data: not-json-at-all\n\ndata: {"partial":\n\ndata: [DONE]\n\n';
    setFetchHandler(
      async () =>
        new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const chunks: TranslationChunk[] = [];
    await makeOpenAICompatBackend('openai').translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const terminal = chunks.find((c) => c.type === 'done' || c.type === 'error');
    expect(terminal).toBeDefined();
  });

  it('emits NETWORK error when fetch rejects', async () => {
    setFetchHandler(async () => {
      throw new TypeError('offline');
    });
    const chunks: TranslationChunk[] = [];
    await makeOpenAICompatBackend('openai').translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') expect(err.code).toBe('NETWORK');
  });
});
