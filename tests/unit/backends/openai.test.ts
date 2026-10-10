import { readBackendAnswer } from '@tests/_helpers/backend';
import { describe, it, expect } from 'vitest';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { sel } from '@tests/_helpers/lang';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { sse } from '@tests/_helpers/backend';

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

describe('openai (openai-compat)', () => {
  it('requires api key', async () => {
    const b = makeOpenAICompatBackend('openai');
    expect(await b.isAvailable({ ...baseConfig, apiKeys: {} })).toBe(false);
    expect(await b.isAvailable(baseConfig)).toBe(true);
  });

  it('streams deltas and emits done', async () => {
    const body = [
      'data: {"choices":[{"delta":{"content":"{\\"translation\\":\\"ok"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"\\",\\"confidence\\":0.7}"}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    setFetchHandler(async () => sse(body));
    const chunks: TranslationChunk[] = [];
    const b = makeOpenAICompatBackend('openai');
    await b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    expect(chunks.filter((c) => c.type === 'delta').length).toBeGreaterThan(0);
    const done = chunks.find((c) => c.type === 'done');
    expect(done).toBeDefined();
    if (done?.type === 'done') expect(readBackendAnswer(chunks)['confidence']).toBeCloseTo(0.7, 2);
  });

  it('classic chat model keeps temperature and sends max_completion_tokens, which OpenAI takes for every model', async () => {
    let sentBody: Record<string, unknown> = {};
    setFetchHandler(async (_url, init) => {
      sentBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"translation":"ok","confidence":1}' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    await makeOpenAICompatBackend('openai').translate(mkArgs({ stream: false }));
    expect(sentBody['temperature']).toBe(0.2);
    expect(sentBody['max_completion_tokens']).toBe(1024);
    expect(sentBody['max_tokens']).toBeUndefined();
    expect(sentBody['reasoning_effort']).toBeUndefined();
  });

  it('maps 401/429 to AUTH/RATE_LIMIT', async () => {
    setFetchHandler(async () => new Response('nope', { status: 401 }));
    const c1: TranslationChunk[] = [];
    await makeOpenAICompatBackend('openai').translate(mkArgs({ onChunk: (c) => c1.push(c) }));
    expect(c1.find((c) => c.type === 'error' && c.code === 'AUTH')).toBeDefined();

    setFetchHandler(async () => new Response('slow', { status: 429 }));
    const c2: TranslationChunk[] = [];
    await makeOpenAICompatBackend('openai').translate(mkArgs({ onChunk: (c) => c2.push(c) }));
    expect(c2.find((c) => c.type === 'error' && c.code === 'RATE_LIMIT')).toBeDefined();
  });

  it('classifies 400/422 as non-transient REQUEST (not NETWORK)', async () => {
    for (const status of [400, 422]) {
      setFetchHandler(async () => new Response('bad', { status }));
      const chunks: TranslationChunk[] = [];
      await makeOpenAICompatBackend('openai').translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
      const err = chunks.find((c) => c.type === 'error');
      expect(err, `status=${status}`).toBeDefined();
      if (err?.type === 'error') expect(err.code, `status=${status}`).toBe('REQUEST');
    }
  });
});
