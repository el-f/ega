import { describe, it, expect } from 'vitest';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { setFetchHandler } from '@tests/mocks/fetch';
import { sel } from '@tests/_helpers/lang';
import { createCancelToken } from '@/shared/cancel-token';
import type { TranslateCallArgs } from '@/shared/backends/base';
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

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
}

describe('AnthropicBackend — transport release on SSE end', () => {
  it('translate: the request signal is aborted once the stream ends', async () => {
    const payload = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"ok\\",\\"confidence\\":0.9}"}}',
      '',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n');
    const body = sseBody([payload]);
    // Spy on body.cancel before handing it to fetch mock
    let signal: AbortSignal | undefined;
    setFetchHandler(async (_url, init) => {
      signal = init?.signal ?? undefined;
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });

    const { token } = createCancelToken();
    const chunks: TranslationChunk[] = [];
    const args: TranslateCallArgs = {
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
      cancel: token,
      onChunk: (c) => chunks.push(c),
      config: baseConfig,
    };

    const b = new AnthropicBackend();
    // Must resolve without throwing (no unhandled rejection)
    await expect(b.translate(args)).resolves.toBeUndefined();

    expect(signal?.aborted, 'the socket must be released, not left to GC').toBe(true);
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });

  it('translate: abort mid-stream emits ABORTED error chunk and does not hang', async () => {
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });
    setFetchHandler(
      async () =>
        new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const { token, cancel } = createCancelToken();
    const chunks: TranslationChunk[] = [];
    const args: TranslateCallArgs = {
      req: {
        id: 'r2',
        text: 'hi',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      system: 'SYS',
      user: 'USER',
      stream: true,
      cancel: token,
      onChunk: (c) => chunks.push(c),
      config: baseConfig,
    };

    const b = new AnthropicBackend();
    const translatePromise = b.translate(args);

    // Push partial chunk then abort
    streamController.enqueue(
      new TextEncoder().encode(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}\n\n',
      ),
    );
    cancel('user');
    streamController.error(new DOMException('aborted', 'AbortError'));

    // Must resolve (not hang) within reasonable time
    await expect(translatePromise).resolves.toBeUndefined();

    const errChunk = chunks.find((c) => c.type === 'error');
    expect(errChunk).toBeDefined();
    expect(errChunk && 'code' in errChunk ? errChunk.code : undefined).toBe('ABORTED');
  });

  it('translateImage: the request signal is aborted once the stream ends', async () => {
    const payload = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"img-ok\\",\\"confidence\\":0.9}"}}',
      '',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n');
    const body = sseBody([payload]);
    let signal: AbortSignal | undefined;
    setFetchHandler(async (_url, init) => {
      signal = init?.signal ?? undefined;
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });

    const { token } = createCancelToken();
    const chunks: TranslationChunk[] = [];
    const b = new AnthropicBackend();
    await expect(
      b.translateImage({
        requestId: 'r-img-1',
        imageBase64: btoa('fakeimage'),
        mediaType: 'image/png',
        cancel: token,
        config: baseConfig,
        onChunk: (c) => chunks.push(c),
      }),
    ).resolves.toBeUndefined();

    expect(signal?.aborted, 'the socket must be released, not left to GC').toBe(true);
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });
});
