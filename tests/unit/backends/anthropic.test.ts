import { describe, it, expect } from 'vitest';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { DEFAULT_MODEL } from '@/shared/settings-defaults';
import { setFetchHandler } from '@tests/mocks/fetch';
import { sel } from '@tests/_helpers/lang';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs, TranslateImageArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

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

function sseResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('AnthropicBackend', () => {
  it('isAvailable true with key, false without', async () => {
    const b = new AnthropicBackend();
    expect(await b.isAvailable(baseConfig)).toBe(true);
    expect(await b.isAvailable({ ...baseConfig, apiKeys: {} })).toBe(false);
  });

  it('streams SSE deltas and emits done with parsed confidence', async () => {
    setFetchHandler(async () =>
      sseResponse(
        [
          'event: content_block_delta',
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"hello"}}',
          '',
          'event: content_block_delta',
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"\\",\\"confidence\\":0.88}"}}',
          '',
          'event: message_stop',
          'data: {"type":"message_stop"}',
          '',
        ].join('\n'),
      ),
    );

    const chunks: TranslationChunk[] = [];
    const b = new AnthropicBackend();
    await b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));

    const done = chunks.find((c) => c.type === 'done');
    expect(done).toBeDefined();
    if (done?.type === 'done') {
      expect(done.confidence).toBeCloseTo(0.88, 2);
    }
    const deltas = chunks.filter((c) => c.type === 'delta');
    expect(deltas.length).toBeGreaterThan(0);
  });

  it('emits AUTH error on 401', async () => {
    setFetchHandler(async () => new Response('{"error":"unauthorized"}', { status: 401 }));
    const chunks: TranslationChunk[] = [];
    const b = new AnthropicBackend();
    await b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') expect(err.code).toBe('AUTH');
  });

  it('emits RATE_LIMIT on 429', async () => {
    setFetchHandler(async () => new Response('rate-limited', { status: 429 }));
    const chunks: TranslationChunk[] = [];
    const b = new AnthropicBackend();
    await b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    expect(chunks.find((c) => c.type === 'error' && c.code === 'RATE_LIMIT')).toBeDefined();
  });

  it('classifies 400/422 as non-transient REQUEST (not NETWORK)', async () => {
    for (const status of [400, 422]) {
      setFetchHandler(async () => new Response('{"error":"bad request"}', { status }));
      const chunks: TranslationChunk[] = [];
      await new AnthropicBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
      const err = chunks.find((c) => c.type === 'error');
      expect(err, `status=${status}`).toBeDefined();
      if (err?.type === 'error') expect(err.code, `status=${status}`).toBe('REQUEST');
    }
  });

  function captureBody(): { current: Record<string, unknown> | undefined } {
    const box: { current: Record<string, unknown> | undefined } = { current: undefined };
    setFetchHandler((_url, init) => {
      box.current = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return sseResponse(['event: message_stop', 'data: {"type":"message_stop"}', ''].join('\n'));
    });
    return box;
  }

  it('translate sends system as an array with an ephemeral cache_control breakpoint', async () => {
    const body = captureBody();
    await new AnthropicBackend().translate(mkArgs({ system: 'STABLE-SYS' }));
    expect(body.current?.['system']).toEqual([
      { type: 'text', text: 'STABLE-SYS', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('translateImage sends system as an array with an ephemeral cache_control breakpoint', async () => {
    const body = captureBody();
    const imgArgs: TranslateImageArgs = {
      imageBase64: 'AAAA',
      mediaType: 'image/png',
      requestId: 'r1',
      cancel: noopCancel(),
      config: baseConfig,
      onChunk: () => {},
      system: 'OCR-SYS',
      user: 'OCR-USER',
    };
    await new AnthropicBackend().translateImage(imgArgs);
    expect(body.current?.['system']).toEqual([
      { type: 'text', text: 'OCR-SYS', cache_control: { type: 'ephemeral' } },
    ]);
  });

  const withModel = (anthropic: string) => ({
    ...baseConfig,
    model: { ...baseConfig.model, anthropic },
  });

  it('keeps temperature for a model that accepts it', async () => {
    const body = captureBody();
    await new AnthropicBackend().translate(mkArgs({ config: withModel('claude-haiku-4-5') }));
    expect(body.current?.['temperature']).toBe(0.2);
  });

  it.each(['claude-sonnet-5', 'claude-opus-4-7', 'claude-opus-5-5', 'claude-fable-5-1'])(
    'omits temperature for %s, which rejects it with a 400',
    async (model) => {
      const text = captureBody();
      await new AnthropicBackend().translate(mkArgs({ config: withModel(model) }));
      expect(text.current).not.toHaveProperty('temperature');
      const image = captureBody();
      await new AnthropicBackend().translateImage({
        imageBase64: 'AAAA',
        mediaType: 'image/png',
        requestId: 'r1',
        cancel: noopCancel(),
        config: withModel(model),
        onChunk: () => {},
      });
      expect(image.current).not.toHaveProperty('temperature');
    },
  );

  it('an empty model slot sends the default model, on text and image calls', async () => {
    const text = captureBody();
    await new AnthropicBackend().translate(mkArgs({ config: withModel('') }));
    expect(text.current?.['model']).toBe(DEFAULT_MODEL.anthropic);
    const image = captureBody();
    await new AnthropicBackend().translateImage({
      imageBase64: 'AAAA',
      mediaType: 'image/png',
      requestId: 'r1',
      cancel: noopCancel(),
      config: withModel(''),
      onChunk: () => {},
    });
    expect(image.current?.['model']).toBe(DEFAULT_MODEL.anthropic);
  });

  it('clamps temperature to the API range 0-1', async () => {
    const body = captureBody();
    await new AnthropicBackend().translate(
      mkArgs({
        config: {
          ...withModel('claude-haiku-4-5'),
          advanced: { ...baseConfig.advanced, temperature: 1.5 },
        },
      }),
    );
    expect(body.current?.['temperature']).toBe(1);
  });

  it.each([
    // Absent or Off: Claude has no off, so its lowest level runs.
    ['claude-sonnet-5-5', undefined, 'low'],
    ['claude-opus-5-5', 'off', 'low'],
    ['claude-opus-4-6', 'low', 'low'],
    ['claude-fable-5-1', 'high', 'high'],
  ] as const)(
    'sends output_config.effort to %s on text and image calls',
    async (model, effort, expected) => {
      const config = {
        ...withModel(model),
        advanced: { ...baseConfig.advanced, ...(effort ? { effort } : {}) },
      };
      const text = captureBody();
      await new AnthropicBackend().translate(mkArgs({ config }));
      expect(text.current?.['output_config']).toEqual({ effort: expected });
      const image = captureBody();
      await new AnthropicBackend().translateImage({
        imageBase64: 'AAAA',
        mediaType: 'image/png',
        requestId: 'r1',
        cancel: noopCancel(),
        config,
        onChunk: () => {},
      });
      expect(image.current?.['output_config']).toEqual({ effort: expected });
    },
  );

  it('max_tokens is the answer length plus room for the effort that runs', async () => {
    const thinking = captureBody();
    await new AnthropicBackend().translate(
      mkArgs({
        config: {
          ...withModel('claude-sonnet-5-5'),
          advanced: { ...baseConfig.advanced, effort: 'medium' },
        },
      }),
    );
    expect(thinking.current?.['max_tokens']).toBe(baseConfig.advanced.maxTokens + 4096);
    const plain = captureBody();
    await new AnthropicBackend().translate(
      mkArgs({ config: withModel('claude-haiku-4-5-20251001') }),
    );
    expect(plain.current?.['max_tokens']).toBe(baseConfig.advanced.maxTokens);
  });

  it.each(['claude-haiku-4-5-20251001', 'claude-sonnet-4-5'])(
    'sends no effort to %s, which does not take it',
    async (model) => {
      const body = captureBody();
      await new AnthropicBackend().translate(mkArgs({ config: withModel(model) }));
      expect(body.current).not.toHaveProperty('output_config');
    },
  );

  it('discoverModels sends the same auth headers the messages endpoint sends', async () => {
    // Without the browser-access header /v1/models 400s for a key that streams fine.
    let headers: Record<string, string> = {};
    setFetchHandler(async (_url, init) => {
      headers = (init?.headers ?? {}) as Record<string, string>;
      return Response.json({ data: [{ id: 'claude-sonnet-4-5' }] });
    });
    await new AnthropicBackend().discoverModels(baseConfig);
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBeTruthy();
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });
});
