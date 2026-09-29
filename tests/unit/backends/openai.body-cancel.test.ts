import { describe, it, expect } from 'vitest';
import { requireTranslateImage } from '@tests/_helpers/backend';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { setFetchHandler } from '@tests/mocks/fetch';
import { sel } from '@tests/_helpers/lang';
import { createCancelToken } from '@/shared/cancel-token';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

const baseConfig = {
  apiKeys: { openai: 'sk-test' },
  model: {
    anthropic: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4o',
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

function openAiSsePayload(text: string): string {
  return [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
    '',
    'data: [DONE]',
    '',
  ].join('\n');
}

function sseBody(payload: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(payload));
      c.close();
    },
  });
}

describe('openai (openai-compat) — transport release on SSE end', () => {
  it('translate: the request signal is aborted once the stream ends', async () => {
    const body = sseBody(openAiSsePayload('{"translation":"ok","confidence":0.9}'));
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

    await expect(makeOpenAICompatBackend('openai').translate(args)).resolves.toBeUndefined();
    expect(signal?.aborted, 'the socket must be released, not left to GC').toBe(true);
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });

  it('translate: abort mid-stream emits ABORTED and does not hang', async () => {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        ctrl = c;
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

    const p = makeOpenAICompatBackend('openai').translate(args);
    ctrl.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'partial' } }] })}\n\n`,
      ),
    );
    cancel('user');
    ctrl.error(new DOMException('aborted', 'AbortError'));

    await expect(p).resolves.toBeUndefined();
    const err = chunks.find((c) => c.type === 'error');
    expect(err && 'code' in err ? err.code : undefined).toBe('ABORTED');
  });

  it('translateImage: the request signal is aborted once the stream ends', async () => {
    const body = sseBody(openAiSsePayload('{"translation":"img-ok","confidence":0.9}'));
    let signal: AbortSignal | undefined;
    setFetchHandler(async (_url, init) => {
      signal = init?.signal ?? undefined;
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });

    const { token } = createCancelToken();
    const chunks: TranslationChunk[] = [];
    await expect(
      requireTranslateImage(makeOpenAICompatBackend('openai'))({
        requestId: 'r-img',
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
