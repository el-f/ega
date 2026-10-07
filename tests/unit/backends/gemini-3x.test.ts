import { describe, it, expect } from 'vitest';
import { GeminiBackend } from '@/shared/backends/gemini';
import { errorCopy } from '@/shared/error-copy';
import { sel } from '@tests/_helpers/lang';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import type { BackendConfig, TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

const config = (gemini: string): BackendConfig =>
  ({
    apiKeys: { gemini: 'test-key' },
    model: { gemini },
    advanced: {
      promptTemplate: { system: 's', user: 'u' },
      perPresetTemplates: {},
      temperature: 0.2,
      maxTokens: 1024,
    },
  }) as unknown as BackendConfig;

const args = (
  gemini: string,
  onChunk: (c: TranslationChunk) => void = () => {},
): TranslateCallArgs => ({
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
  onChunk,
  config: config(gemini),
});

const sse = (body: string): Response =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });

const DONE =
  'data: {"candidates":[{"content":{"parts":[{"text":"{\\"translation\\":\\"hi\\"}"}]},"finishReason":"STOP"}]}\n\n';

async function sentGenerationConfig(model: string): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  setFetchHandler(async (_url, init) => {
    body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return sse(DONE);
  });
  await new GeminiBackend().translate(args(model));
  return body['generationConfig'] as Record<string, unknown>;
}

describe('Gemini 3.x requests', () => {
  it.each([
    ['gemini-3.5-flash-lite', 'MINIMAL'],
    ['gemini-3.1-flash-lite', 'MINIMAL'],
    ['gemini-3.5-flash', 'MINIMAL'],
    ['gemini-3-flash-preview', 'MINIMAL'],
    ['gemini-3.8-flash', 'LOW'],
    ['gemini-3.1-pro-preview', 'LOW'],
    ['gemini-3-pro-preview', 'LOW'],
  ])('%s gets thinkingLevel %s, no budget and no temperature', async (model, level) => {
    const gc = await sentGenerationConfig(model);
    expect(gc['thinkingConfig']).toEqual({ thinkingLevel: level });
    expect(gc).not.toHaveProperty('temperature');
  });

  it('a -latest alias gets no thinking field: its target can change under it', async () => {
    const gc = await sentGenerationConfig('gemini-flash-lite-latest');
    expect(gc).not.toHaveProperty('thinkingConfig');
    expect(gc).not.toHaveProperty('temperature');
  });

  it('2.5 Flash keeps temperature and a zero budget', async () => {
    const gc = await sentGenerationConfig('gemini-2.5-flash');
    expect(gc['thinkingConfig']).toEqual({ thinkingBudget: 0 });
    expect(gc['temperature']).toBe(0.2);
  });

  it('counts thinking tokens as output, the way Google bills them', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"candidates":[{"content":{"parts":[{"text":"{\\"translation\\":\\"hi\\"}"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":50,"candidatesTokenCount":12,"thoughtsTokenCount":30}}\n\n',
      ),
    );
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(args('gemini-3.5-flash-lite', (c) => chunks.push(c)));
    const done = chunks.find((c) => c.type === 'done');
    expect(done?.type === 'done' ? done.usage : null).toEqual({
      inputTokens: 50,
      outputTokens: 42,
      reasoningTokens: 30,
    });
  });

  it('names the new default when a key has no access to a 2.5 model', async () => {
    setFetchHandler(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 404,
              message:
                'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use a newer model.',
              status: 'NOT_FOUND',
            },
          }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        ),
    );
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(args('gemini-2.5-flash', (c) => chunks.push(c)));
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('REQUEST');
    expect(err?.type === 'error' ? err.message : '').toMatch(
      /Google gives Gemini 2\.5 only to keys that used it before\. Pick gemini-3\.5-flash-lite/,
    );
    // Google's advice comes first and the transport's "does not know this model" second; both are read.
    expect(errorCopy('REQUEST', err?.type === 'error' ? err.message : '')?.id).toBe(
      'REQUEST_MODEL',
    );
  });

  it('reads a 400 for a bad or expired key as AUTH, so the chain moves on and points at the key', async () => {
    setFetchHandler(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 400,
              message: 'API key not valid. Please pass a valid API key.',
              status: 'INVALID_ARGUMENT',
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                  reason: 'API_KEY_INVALID',
                  domain: 'googleapis.com',
                },
              ],
            },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
    );
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(args('gemini-3.5-flash-lite', (c) => chunks.push(c)));
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('AUTH');
    expect(err?.type === 'error' ? err.message : '').toMatch(/^The backend rejected the API key/);
  });

  it.each([403, 400])(
    'a %i on a 2.5 id also names the new default, since the status a new key gets is not documented',
    async (status) => {
      setFetchHandler(
        async () =>
          new Response(JSON.stringify({ error: { code: status, message: 'denied' } }), { status }),
      );
      const chunks: TranslationChunk[] = [];
      await new GeminiBackend().translate(args('gemini-2.5-flash', (c) => chunks.push(c)));
      const err = chunks.find((c) => c.type === 'error');
      expect(err?.type === 'error' ? err.message : '').toMatch(/^Google gives Gemini 2\.5 only/);
    },
  );

  it.each([
    [403, 'Your API key was reported as leaked. Please use another API key.'],
    [403, 'Generative Language API has not been used in project 1 (SERVICE_DISABLED).'],
    [400, 'User location is not supported for the API use.'],
    [413, 'Request payload size exceeds the limit.'],
  ])('keeps the real cause first on a 2.5 id: %i %s', async (status, message) => {
    setFetchHandler(
      async () => new Response(JSON.stringify({ error: { code: status, message } }), { status }),
    );
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(args('gemini-2.5-flash', (c) => chunks.push(c)));
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.message : '').not.toMatch(/Gemini 2\.5 only/);
  });

  it('gives no 2.5 hint on a 3.x id or a rate limit', async () => {
    setFetchHandler(async () => new Response('{}', { status: 403 }));
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(args('gemini-3.5-flash-lite', (c) => chunks.push(c)));
    setFetchHandler(async () => new Response('{}', { status: 429 }));
    await new GeminiBackend().translate(args('gemini-2.5-flash', (c) => chunks.push(c)));
    const messages = chunks.flatMap((c) => (c.type === 'error' ? [c.message] : []));
    expect(messages).toHaveLength(2);
    for (const m of messages) expect(m).not.toMatch(/Gemini 2\.5/);
  });

  it('keeps any other 400 as REQUEST', async () => {
    setFetchHandler(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 400, message: 'Invalid JSON payload.', status: 'INVALID_ARGUMENT' },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
    );
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(args('gemini-3.5-flash-lite', (c) => chunks.push(c)));
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('REQUEST');
  });
});

describe('Gemini discoverModels', () => {
  it('asks for one big page and keeps only text chat models', async () => {
    let url = '';
    setFetchHandler(async (u) => {
      url = u;
      return Response.json({
        models: [
          { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.8-flash-live', supportedGenerationMethods: ['generateContent'] },
          {
            name: 'models/gemini-3.1-flash-lite-image',
            supportedGenerationMethods: ['generateContent'],
          },
          { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-omni-1.1-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
          {
            name: 'models/gemini-robotics-er-2-preview',
            supportedGenerationMethods: ['generateContent'],
          },
          { name: 'models/gemma-3-27b-it', supportedGenerationMethods: ['generateContent'] },
        ],
      });
    });
    const ids = await new GeminiBackend().discoverModels(config(''));
    expect(url).toContain('pageSize=1000');
    expect(ids).toEqual([
      'gemini-3.5-flash-lite',
      'gemini-flash-latest',
      'gemini-robotics-er-2-preview',
    ]);
  });

  it('lists the ids Google names for new projects first, then the rest in API order', async () => {
    setFetchHandler(async () =>
      Response.json({
        models: [
          'gemini-2.5-pro',
          'gemini-3.8-flash',
          'gemini-flash-latest',
          'gemini-3.5-flash-lite',
        ].map((id) => ({ name: `models/${id}`, supportedGenerationMethods: ['generateContent'] })),
      }),
    );
    expect(await new GeminiBackend().discoverModels(config(''))).toEqual([
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-2.5-pro',
      'gemini-flash-latest',
    ]);
  });
});
