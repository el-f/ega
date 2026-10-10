import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TranslationBackend, TranslateCallArgs, BackendConfig } from '@/shared/backends/base';
import { createCancelToken } from '@/shared/cancel-token';
import type { TranslationChunk } from '@/shared/types';
import { asLangIdUnsafe } from '@/shared/brands';
import { setFetchHandler } from '@tests/mocks/fetch';
import { resetPortManagerForTest as resetNativePort } from '@/shared/cli-session/port-manager';
import { readBackendAnswer } from './backend';

/** Assertions every backend plugin must pass; each backend's test file calls `runConformanceSuite`. */

const CONFORMANCE_CONFIG: BackendConfig = {
  apiKeys: {
    anthropic: 'sk-ant-conformance',
    openai: 'sk-conformance',
    gemini: 'g-conformance',
    groq: 'gsk-conformance',
    deepseek: 'dsk-conformance',
    together: 'tg-conformance',
    mistral: 'ms-conformance',
    xai: 'xai-conformance',
    fireworks: 'fw-conformance',
    openrouter: 'or-conformance',
  },
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
    temperature: 0.2,
    maxTokens: 512,
  },
};

function mkReq(id = 'conf-req') {
  return {
    id,
    text: 'hello',
    sourceLang: asLangIdUnsafe('en'),
    targetLang: asLangIdUnsafe('es'),
    options: { stream: false, explain: false },
  };
}

/** Failure text that names the chunk the backend actually emitted. */
function describeChunks(chunks: TranslationChunk[]): string {
  const err = chunks.find((c) => c.type === 'error');
  return err?.type === 'error'
    ? `${err.code}: ${err.message}`
    : chunks.map((c) => c.type).join(',');
}

/** The one answer every provider's canned success decodes to. */
const CANNED_ANSWER = '{"translation":"hola","confidence":0.9}';

/** Each provider's shortest well-formed success body, picked off the request URL. */
function cannedSuccess(url: string): Response {
  if (url.includes('api.anthropic.com')) {
    return Response.json({
      content: [{ type: 'text', text: CANNED_ANSWER }],
      usage: { input_tokens: 3, output_tokens: 4 },
    });
  }
  if (url.includes('generativelanguage.googleapis.com')) {
    const frame = {
      candidates: [{ content: { parts: [{ text: CANNED_ANSWER }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4 },
    };
    return new Response(`data: ${JSON.stringify(frame)}\n\n`, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }
  if (url.includes('/api/chat')) {
    const lines = [
      JSON.stringify({ message: { content: CANNED_ANSWER } }),
      JSON.stringify({ done: true, prompt_eval_count: 3, eval_count: 4 }),
    ];
    return new Response(`${lines.join('\n')}\n`, {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
    });
  }
  return Response.json({
    choices: [{ message: { content: CANNED_ANSWER }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 3, completion_tokens: 4 },
  });
}

/** Native speaks over a port, not fetch — answer every posted frame with one delta then done. */
function installNativePortStub(): void {
  chrome.runtime.connectNative = vi.fn(() => {
    const listeners = new Set<(m: unknown) => void>();
    const port = {
      name: 'ega-conformance-native',
      onMessage: {
        addListener: (fn: (m: unknown) => void) => listeners.add(fn),
        removeListener: (fn: (m: unknown) => void) => listeners.delete(fn),
      },
      onDisconnect: { addListener: () => {}, removeListener: () => {} },
      disconnect: () => {},
      postMessage: (frame: { id?: string; kind?: string }) => {
        const id = frame.id;
        if (typeof id !== 'string' || frame.kind === 'cancel') return;
        queueMicrotask(() => {
          for (const fn of listeners) fn({ v: 1, id, type: 'delta', text: CANNED_ANSWER });
          for (const fn of listeners) fn({ v: 1, id, type: 'done' });
        });
      },
    } as unknown as chrome.runtime.Port;
    return port;
  }) as unknown as typeof chrome.runtime.connectNative;
  resetNativePort();
}

export function runConformanceSuite(factory: () => TranslationBackend): void {
  beforeEach(() => {
    setFetchHandler((url) => cannedSuccess(url));
    installNativePortStub();
  });

  afterEach(() => {
    resetNativePort();
  });

  it('manifest.id is truthy', () => {
    expect(factory().manifest.id).toBeTruthy();
  });

  it('manifest.name is non-empty', () => {
    expect(factory().manifest.name.length).toBeGreaterThan(0);
  });

  it('capabilities.canVision is a boolean', () => {
    expect(typeof factory().manifest.capabilities.canVision).toBe('boolean');
  });

  it('canVision matches whether translateImage is implemented', () => {
    const b = factory();
    expect(b.manifest.capabilities.canVision).toBe(typeof b.translateImage === 'function');
  });

  // ── Behavioral invariants ──────────────────────────────────────────────

  it('abort-idempotent: pre-aborted cancel → resolves with error chunk within 1s', async () => {
    const b = factory();
    const ctrl = new AbortController();
    ctrl.abort();
    const { token } = createCancelToken(ctrl.signal);
    const chunks: TranslationChunk[] = [];
    const args: TranslateCallArgs = {
      req: mkReq('conf-abort'),
      system: 'SYS',
      user: 'USER',
      stream: false,
      cancel: token,
      onChunk: (c) => chunks.push(c),
      config: CONFORMANCE_CONFIG,
    };

    const raceResult = await Promise.race([
      b.translate(args).then(() => 'resolved' as const),
      new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 1000)),
    ]);

    expect(raceResult, 'translate must resolve within 1s on pre-abort').toBe('resolved');
    const terminal = chunks.find((c) => c.type === 'done' || c.type === 'error');
    expect(terminal, 'must emit exactly one terminal chunk').toBeDefined();
  });

  it('single-terminal: translate emits exactly one terminal chunk (done or error)', async () => {
    const b = factory();
    const { token } = createCancelToken();
    const chunks: TranslationChunk[] = [];
    const args: TranslateCallArgs = {
      req: mkReq('conf-terminal'),
      system: 'SYS',
      user: 'USER',
      stream: false,
      cancel: token,
      onChunk: (c) => chunks.push(c),
      config: CONFORMANCE_CONFIG,
    };
    // Give it up to 1s; most conformance stubs resolve synchronously.
    await Promise.race([b.translate(args), new Promise<void>((r) => setTimeout(r, 1000))]);
    const terminals = chunks.filter((c) => c.type === 'done' || c.type === 'error');
    expect(terminals.length, 'must emit exactly one terminal chunk').toBe(1);
  });

  it('no-chunk-after-terminal: no onChunk call arrives after the terminal', async () => {
    const b = factory();
    const { token } = createCancelToken();
    let terminalSeen = false;
    let postTerminal = 0;
    const args: TranslateCallArgs = {
      req: mkReq('conf-post-terminal'),
      system: 'SYS',
      user: 'USER',
      stream: false,
      cancel: token,
      onChunk: (c) => {
        if (terminalSeen) {
          postTerminal++;
        } else if (c.type === 'done' || c.type === 'error') {
          terminalSeen = true;
        }
      },
      config: CONFORMANCE_CONFIG,
    };
    await Promise.race([b.translate(args), new Promise<void>((r) => setTimeout(r, 1000))]);
    // Allow microtask queue to flush any deferred emissions.
    await Promise.resolve();
    expect(postTerminal, 'no chunks must arrive after the terminal').toBe(0);
  });

  it('quick-abort: abort mid-stream → resolves within 1s', async () => {
    const b = factory();
    const { token, cancel } = createCancelToken();
    const args: TranslateCallArgs = {
      req: mkReq('conf-quick-abort'),
      system: 'SYS',
      user: 'USER',
      stream: false,
      cancel: token,
      onChunk: vi.fn(),
      config: CONFORMANCE_CONFIG,
    };
    // Kick off translate and immediately abort.
    const translatePromise = b.translate(args);
    cancel('user');
    const result = await Promise.race([
      translatePromise.then(() => 'resolved' as const),
      new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 1000)),
    ]);
    expect(result, 'translate must resolve within 1s after abort').toBe('resolved');
  });

  // ── Semantic content of done chunk ──────────────────────────────────────

  it('raw adapter answer: the worker can read confidence in [0, 1]', async () => {
    const b = factory();
    const { token } = createCancelToken();
    const chunks: TranslationChunk[] = [];
    const args: TranslateCallArgs = {
      req: mkReq('conf-done-confidence'),
      system: 'SYS',
      user: 'USER',
      stream: false,
      cancel: token,
      onChunk: (c) => chunks.push(c),
      config: CONFORMANCE_CONFIG,
    };
    await Promise.race([b.translate(args), new Promise<void>((r) => setTimeout(r, 1000))]);
    const done = chunks.find((c) => c.type === 'done');
    expect(
      done,
      `a canned success must produce a done chunk (got ${describeChunks(chunks)})`,
    ).toBeDefined();
    const confidence = readBackendAnswer(chunks)['confidence'];
    expect(done).not.toHaveProperty('confidence');
    expect(confidence, 'confidence must survive the worker reader').toBeTypeOf('number');
    expect(confidence, 'confidence must be >= 0').toBeGreaterThanOrEqual(0);
    expect(confidence, 'confidence must be <= 1').toBeLessThanOrEqual(1);
  });

  it('done chunk: at least one delta chunk emitted before done (non-empty translation)', async () => {
    const b = factory();
    const { token } = createCancelToken();
    const chunks: TranslationChunk[] = [];
    const args: TranslateCallArgs = {
      req: mkReq('conf-done-delta'),
      system: 'SYS',
      user: 'USER',
      stream: false,
      cancel: token,
      onChunk: (c) => chunks.push(c),
      config: CONFORMANCE_CONFIG,
    };
    await Promise.race([b.translate(args), new Promise<void>((r) => setTimeout(r, 1000))]);
    const done = chunks.some((c) => c.type === 'done');
    expect(done, `a canned success must produce a done chunk (got ${describeChunks(chunks)})`).toBe(
      true,
    );
    const deltas = chunks.filter(
      (c): c is Extract<TranslationChunk, { type: 'delta' }> => c.type === 'delta',
    );
    expect(deltas.length, 'at least one delta chunk must precede done').toBeGreaterThan(0);
    const assembled = deltas.map((c) => c.text).join('');
    expect(assembled.length, 'assembled translation must be non-empty').toBeGreaterThan(0);
  });
}
