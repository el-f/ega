import { describe, it, expect } from 'vitest';
import { AnthropicBackend } from '@/shared/backends/anthropic';
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
