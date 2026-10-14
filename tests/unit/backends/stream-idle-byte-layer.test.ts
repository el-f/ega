import { describe, it, expect, vi, afterEach } from 'vitest';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { GeminiBackend } from '@/shared/backends/gemini';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { STREAM_IDLE_TIMEOUT_MS } from '@/shared/backends/stream-resilience';
import { setFetchHandler } from '@tests/mocks/fetch';
import { sel } from '@tests/_helpers/lang';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { pacedBody } from './_stream-bytes';

const baseConfig = {
  apiKeys: { anthropic: 'sk-ant-test', openai: 'sk-openai', gemini: 'g-key', openrouter: 'or-key' },
  model: {
    anthropic: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4o-mini',
    gemini: 'gemini-1.5-flash',
    groq: '',
    deepseek: '',
    together: '',
    mistral: '',
    xai: '',
    fireworks: '',
    openrouter: 'openai/gpt-4o-mini',
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

/** Four heartbeats 10s apart — 40s of live socket, zero parsed events. */
const HEARTBEAT_STEPS = [
  { afterMs: 10_000, text: ': PROCESSING\n\n' },
  { afterMs: 10_000, text: ': PROCESSING\n\n' },
  { afterMs: 10_000, text: ': PROCESSING\n\n' },
  { afterMs: 10_000, text: ': PROCESSING\n\n' },
];

const TOTAL_MS = 60_000;

async function driveClock(): Promise<void> {
  // One tick at a time so each enqueue is observed before the next gap opens.
  for (let elapsed = 0; elapsed < TOTAL_MS; elapsed += 1_000) {
    await vi.advanceTimersByTimeAsync(1_000);
  }
}

describe('idle watchdog counts bytes, not parsed events', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('OpenRouter-style heartbeat comments keep the stream alive past the idle window', async () => {
    vi.useFakeTimers();
    const body = pacedBody([
      ...HEARTBEAT_STEPS,
      {
        afterMs: 5_000,
        text: 'data: {"choices":[{"delta":{"content":"{\\"translation\\":\\"ok\\",\\"confidence\\":0.9}"}}]}\n\n',
      },
      { afterMs: 100, text: 'data: [DONE]\n\n' },
    ]);
    // The model-list read answers at once, so only the chat stream is paced.
    setFetchHandler(async (url) =>
      url.includes('/api/v1/models')
        ? Response.json({ data: [] })
        : new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const chunks: TranslationChunk[] = [];
    const p = makeOpenAICompatBackend('openrouter').translate(
      mkArgs({ onChunk: (c) => chunks.push(c) }),
    );
    await driveClock();
    await p;
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });

  it('Anthropic ping frames keep the stream alive past the idle window', async () => {
    vi.useFakeTimers();
    const body = pacedBody([
      { afterMs: 10_000, text: 'event: ping\ndata: {"type":"ping"}\n\n' },
      { afterMs: 10_000, text: 'event: ping\ndata: {"type":"ping"}\n\n' },
      { afterMs: 10_000, text: 'event: ping\ndata: {"type":"ping"}\n\n' },
      { afterMs: 10_000, text: 'event: ping\ndata: {"type":"ping"}\n\n' },
      {
        afterMs: 5_000,
        text: 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"ok\\"}"}}\n\n',
      },
      { afterMs: 100, text: 'data: {"type":"message_stop"}\n\n' },
    ]);
    setFetchHandler(
      async () =>
        new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const chunks: TranslationChunk[] = [];
    const p = new AnthropicBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    await driveClock();
    await p;
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });

  it('Gemini keeps the stream alive while only comment bytes arrive', async () => {
    vi.useFakeTimers();
    const body = pacedBody([
      ...HEARTBEAT_STEPS,
      {
        afterMs: 5_000,
        text: 'data: {"candidates":[{"content":{"parts":[{"text":"{\\"translation\\":\\"ok\\"}"}]},"finishReason":"STOP"}]}\n\n',
      },
    ]);
    setFetchHandler(
      async () =>
        new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const chunks: TranslationChunk[] = [];
    const p = new GeminiBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    await driveClock();
    await p;
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });

  it('still times out when the BYTES stop, not just the events', async () => {
    vi.useFakeTimers();
    // One heartbeat, then silence: no bytes at all past 10s.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(': PROCESSING\n\n'));
      },
    });
    setFetchHandler((_url, init) => {
      init?.signal?.addEventListener('abort', () => {
        // Mirror real fetch: aborting the request errors the body from the source side.
        void body.cancel().catch(() => {});
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    const chunks: TranslationChunk[] = [];
    const p = makeOpenAICompatBackend('openai').translate(
      mkArgs({ onChunk: (c) => chunks.push(c) }),
    );
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS + 500);
    await p;
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') expect(err.code).toBe('TIMEOUT');
  });
});
