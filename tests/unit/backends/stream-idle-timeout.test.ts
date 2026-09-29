import { describe, it, expect, vi, afterEach } from 'vitest';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { STREAM_IDLE_TIMEOUT_MS } from '@/shared/backends/stream-resilience';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { GeminiBackend } from '@/shared/backends/gemini';
import { OllamaBackend } from '@/shared/backends/ollama';
import { setFetchHandler } from '@tests/mocks/fetch';
import { sel } from '@tests/_helpers/lang';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

const baseConfig = {
  apiKeys: { anthropic: 'sk-ant-test', openai: 'sk-openai', gemini: 'g-key' },
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

/** Sends one delta, then stalls forever without closing; the idle watchdog must abort with TIMEOUT. */
function stallingBody(firstChunk: string): {
  body: ReadableStream<Uint8Array>;
  cancelled: () => boolean;
  /** Errors the stream from the source, as real fetch does on abort; body.cancel() throws while a reader holds the lock. */
  failFromSource: () => void;
} {
  let wasCancelled = false;
  let ctrl: ReadableStreamDefaultController<Uint8Array> | undefined;
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      ctrl = controller;
      controller.enqueue(enc.encode(firstChunk));
      // Never enqueue again, never close — the stream stalls here.
    },
    cancel() {
      wasCancelled = true;
    },
  });
  return {
    body,
    cancelled: () => wasCancelled,
    failFromSource: () => {
      wasCancelled = true;
      ctrl?.error(new DOMException('aborted', 'AbortError'));
    },
  };
}

describe('stream idle-timeout (read-stall watchdog)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('exports a positive idle-timeout constant', () => {
    expect(STREAM_IDLE_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('Anthropic: a mid-stream stall surfaces a TIMEOUT error and tears down the body', async () => {
    vi.useFakeTimers();
    const { body, cancelled, failFromSource } = stallingBody(
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}\n\n',
    );
    // As in real fetch, aborting the signal tears down the body; the mock wires that itself.
    setFetchHandler((_url, init) => {
      init?.signal?.addEventListener('abort', failFromSource);
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    const chunks: TranslationChunk[] = [];
    const p = new AnthropicBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    // Let the first delta flow, then jump past the idle window.
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS + 100);
    await p;
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') expect(err.code).toBe('TIMEOUT');
    // The watchdog aborted the fetch, which cancels the underlying body.
    expect(cancelled()).toBe(true);
  });

  it('OpenAI-compat: a mid-stream stall surfaces a TIMEOUT error', async () => {
    vi.useFakeTimers();
    const { body } = stallingBody('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
    setFetchHandler(
      async () =>
        new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const chunks: TranslationChunk[] = [];
    const p = makeOpenAICompatBackend('openai').translate(
      mkArgs({ onChunk: (c) => chunks.push(c) }),
    );
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS + 100);
    await p;
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') expect(err.code).toBe('TIMEOUT');
  });

  it('Gemini: a mid-stream stall surfaces a TIMEOUT error', async () => {
    vi.useFakeTimers();
    const { body } = stallingBody(
      'data: {"candidates":[{"content":{"parts":[{"text":"partial"}]}}]}\n\n',
    );
    setFetchHandler(
      async () =>
        new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const chunks: TranslationChunk[] = [];
    const p = new GeminiBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS + 100);
    await p;
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') expect(err.code).toBe('TIMEOUT');
  });

  it('Ollama: a mid-stream stall surfaces a TIMEOUT error', async () => {
    vi.useFakeTimers();
    const { body } = stallingBody('{"message":{"content":"partial"}}\n');
    setFetchHandler(
      async () =>
        new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } }),
    );
    const chunks: TranslationChunk[] = [];
    const p = new OllamaBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS + 100);
    await p;
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') expect(err.code).toBe('TIMEOUT');
  });

  it('does not fire when data keeps flowing (normal completion is unaffected)', async () => {
    // Real timers here: the stream completes immediately, well within the
    // idle window, so the watchdog must never trip.
    const payload = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"ok\\",\\"confidence\\":0.9}"}}',
      '',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n');
    setFetchHandler(
      async () =>
        new Response(payload, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    );
    const chunks: TranslationChunk[] = [];
    await new AnthropicBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
  });
});
