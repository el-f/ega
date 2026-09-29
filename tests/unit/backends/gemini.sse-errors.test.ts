import { describe, it, expect } from 'vitest';
import { GeminiBackend } from '@/shared/backends/gemini';
import { sel } from '@tests/_helpers/lang';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

// PARSE + NETWORK coverage for Gemini. AUTH/RATE_LIMIT
// already covered in gemini.test.ts.

const baseConfig = {
  apiKeys: { gemini: 'test-key' },
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

describe('GeminiBackend SSE error paths', () => {
  it('emits AUTH on 401', async () => {
    setFetchHandler(async () => new Response('bad', { status: 401 }));
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    expect(chunks.find((c) => c.type === 'error' && c.code === 'AUTH')).toBeDefined();
  });

  it('emits RATE_LIMIT on 429', async () => {
    setFetchHandler(async () => new Response('slow', { status: 429 }));
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    expect(chunks.find((c) => c.type === 'error' && c.code === 'RATE_LIMIT')).toBeDefined();
  });

  it('ends with a done or error chunk on a malformed SSE body', async () => {
    // Non-parsable JSON inside data: — iterator should drain and terminate.
    const body = 'data: not-json-at-all\n\ndata: {"malformed":\n\n';
    setFetchHandler(
      async () =>
        new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const terminal = chunks.find((c) => c.type === 'done' || c.type === 'error');
    expect(terminal).toBeDefined();
  });

  it('survives a null element in a multi-part frame (does not crash the stream)', async () => {
    // A malformed frame can carry a null `part`; reading `.text` on it threw
    // and killed the whole generator, dropping the valid text that followed.
    const body =
      'data: {"candidates":[{"content":{"parts":[null,{"text":"hello"}]}}]}\n\n' +
      'data: {"candidates":[{"content":{"parts":[{"text":""}]},"finishReason":"STOP"}]}\n\n';
    setFetchHandler(
      async () =>
        new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const deltaText = chunks
      .filter((c): c is Extract<TranslationChunk, { type: 'delta' }> => c.type === 'delta')
      .map((c) => c.text)
      .join('');
    expect(deltaText).toContain('hello');
    // No transport error surfaced from a thrown generator.
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
  });

  it('reclassifies finishReason=MAX_TOKENS as REQUEST (non-transient)', async () => {
    // REQUEST, not NETWORK: every backend would hit the same token budget, so stop the chain.
    const body =
      'data: {"candidates":[{"content":{"parts":[{"text":""}]},"finishReason":"MAX_TOKENS"}]}\n\n';
    setFetchHandler(
      async () =>
        new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('REQUEST');
      expect(err.message).toContain('max-tokens');
    }
  });

  it('names an unlisted finishReason in the empty-answer message', async () => {
    const body =
      'data: {"candidates":[{"content":{"parts":[{"text":""}]},"finishReason":"OTHER"}]}\n\n';
    setFetchHandler(
      async () =>
        new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('SERVER');
      expect(err.message).toContain('OTHER');
    }
  });

  it('names the finishReason on the whole-body path too', async () => {
    setFetchHandler(async () => {
      const res = Response.json({
        candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'OTHER' }],
      });
      // Gemini always asks for a stream, so the whole-body path runs only when there is no readable body.
      Object.defineProperty(res, 'body', { value: null });
      return res;
    });
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('SERVER');
      expect(err.message).toContain('OTHER');
    }
  });

  it('emits NETWORK error when fetch rejects', async () => {
    setFetchHandler(async () => {
      throw new TypeError('offline');
    });
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') expect(err.code).toBe('NETWORK');
  });
});
