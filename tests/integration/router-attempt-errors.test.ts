import { describe, it, expect, vi, afterEach } from 'vitest';
import { runTranslateAttempt } from '@/background/router-attempt';
import { createTranslateFsm } from '@/background/router-fsm';
import { createCancelToken, type CancelTokenSource } from '@/shared/cancel-token';
import { buildBackendConfig } from '@/shared/backends/build-config';
import type { TranslateCallArgs, TranslationBackend } from '@/shared/backends/base';
import type { ResultAttempt, TranslationChunk, TranslationRequest } from '@/shared/types';
import { asBackendIdUnsafe, asLangIdUnsafe } from '@/shared/brands';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { testManifest } from '@tests/_helpers/backend';

/** router-attempt error path: transient and throw logs, prior-error summary, abort classification, synthesized terminal. */

const ANTHROPIC = asBackendIdUnsafe('anthropic');
type ErrorChunk = Extract<TranslationChunk, { type: 'error' }>;

function makeReq(): TranslationRequest {
  return {
    id: 'r1',
    text: 'hi',
    sourceLang: 'auto',
    targetLang: asLangIdUnsafe('en'),
    options: { stream: false, explain: false },
  };
}

/** Pins performance.now() so latencyMs assertions are exact numbers. */
function fakeClock(start: number): { set: (v: number) => void } {
  let t = start;
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  return {
    set: (v: number) => {
      t = v;
    },
  };
}

async function run(opts: {
  translate: (a: TranslateCallArgs) => Promise<void>;
  isLast?: boolean;
  source?: CancelTokenSource;
  attemptLog?: ResultAttempt[];
}) {
  const fsm = createTranslateFsm();
  fsm.send({ type: 'start' });
  const source = opts.source ?? createCancelToken();
  const attemptLog = opts.attemptLog ?? [];
  const chunks: TranslationChunk[] = [];
  const info = vi.fn();
  const backend: TranslationBackend = {
    id: ANTHROPIC,
    manifest: testManifest('anthropic'),
    isAvailable: async () => true,
    translate: opts.translate,
  };
  const outcome = await runTranslateAttempt({
    backend,
    isLast: opts.isLast ?? true,
    reqView: makeReq(),
    reqOptions: makeReq().options,
    streaming: false,
    cfg: buildBackendConfig(DEFAULT_SETTINGS),
    system: 'sys',
    user: 'usr',
    cancel: source.token,
    fsm,
    attemptLog,
    reqId: 'r1',
    onChunk: (c) => chunks.push(c),
    attachMeta: (c) => c,
    logger: { debug() {}, info, warn() {}, error() {} },
  });
  const errors = chunks.filter((c): c is ErrorChunk => c.type === 'error');
  return { outcome, fsm, attemptLog, chunks, errors, info };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('router-attempt — transient log and chain summary', () => {
  it('logs the exact transient line and falls through without a terminal chunk', async () => {
    const r = await run({
      isLast: false,
      translate: async ({ onChunk }) => {
        onChunk({ type: 'error', requestId: 'r1', code: 'NETWORK', message: 'conn reset' });
      },
    });
    expect(r.info).toHaveBeenCalledWith(
      'backend anthropic transient error (NETWORK); falling back',
    );
    expect(r.errors).toHaveLength(0);
    expect(r.outcome.kind).toBe('transient_error_falling_through');
  });

  it('a wallclock cancel turns the same transient fallthrough into timed_out', async () => {
    const source = createCancelToken();
    const r = await run({
      isLast: false,
      source,
      translate: async ({ onChunk }) => {
        onChunk({ type: 'error', requestId: 'r1', code: 'NETWORK', message: 'conn reset' });
        source.cancel('wallclock');
      },
    });
    expect(r.outcome.kind).toBe('timed_out');
  });

  it('summarizes ONLY prior error entries in words, with "Error" for a code-less one', async () => {
    const seeded: ResultAttempt[] = [
      { backendId: asBackendIdUnsafe('native'), status: 'ok', latencyMs: 3 },
      { backendId: asBackendIdUnsafe('openai'), status: 'error', message: 'boom', latencyMs: 5 },
    ];
    const r = await run({
      attemptLog: seeded,
      translate: async ({ onChunk }) => {
        onChunk({ type: 'error', requestId: 'r1', code: 'REQUEST', message: 'bad request' });
      },
    });
    const summary = 'bad request\nopenai: Error · anthropic: Request rejected';
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toEqual({
      type: 'error',
      requestId: 'r1',
      code: 'REQUEST',
      message: summary,
    });
    expect(r.fsm.context().finalError).toEqual({ code: 'REQUEST', message: summary });
  });

  it('a lone failure keeps the raw backend message (pins the > 1 boundary)', async () => {
    const r = await run({
      translate: async ({ onChunk }) => {
        onChunk({ type: 'error', requestId: 'r1', code: 'REQUEST', message: 'bad request' });
      },
    });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.message).toBe('bad request');
    expect(r.fsm.context().finalError).toEqual({ code: 'REQUEST', message: 'bad request' });
  });
});

describe('router-attempt — throw path', () => {
  it('a throw on a non-last backend logs the exact line and records a clamped entry', async () => {
    const clock = fakeClock(1000);
    const long = 'x'.repeat(500);
    const r = await run({
      isLast: false,
      translate: async () => {
        clock.set(1250);
        throw new Error(long);
      },
    });
    expect(r.info).toHaveBeenCalledWith(`backend anthropic threw (${long}); falling back`);
    expect(r.attemptLog).toEqual([
      {
        backendId: ANTHROPIC,
        status: 'error',
        code: 'UNKNOWN',
        message: 'x'.repeat(400),
        latencyMs: 250,
      },
    ]);
    expect(r.errors).toHaveLength(0);
    expect(r.outcome.kind).toBe('transient_error_falling_through');
  });

  it('a throw on the LAST backend surfaces UNKNOWN with the throw message', async () => {
    const r = await run({
      translate: async () => {
        throw new Error('socket hang up');
      },
    });
    expect(r.errors).toEqual([
      { type: 'error', requestId: 'r1', code: 'UNKNOWN', message: 'socket hang up' },
    ]);
    expect(r.fsm.context().finalError).toEqual({ code: 'UNKNOWN', message: 'socket hang up' });
    expect(r.outcome.kind).toBe('final_error_emitted');
  });

  it('an AbortError-named throw on a live signal is NOT reported as a backend error', async () => {
    const clock = fakeClock(1000);
    const r = await run({
      translate: async () => {
        clock.set(1400);
        throw Object.assign(new Error('user aborted'), { name: 'AbortError' });
      },
    });
    expect(r.attemptLog).toEqual([
      {
        backendId: ANTHROPIC,
        status: 'error',
        code: 'UNKNOWN',
        message: 'backend resolved without terminal',
        latencyMs: 400,
      },
    ]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.message).toBe('backend resolved without terminal');
  });

  it('an aborted signal swallows the throw entirely — no log entry, no chunk', async () => {
    const source = createCancelToken();
    const r = await run({
      source,
      translate: async () => {
        source.cancel('user');
        throw new Error('boom');
      },
    });
    expect(r.attemptLog).toEqual([]);
    expect(r.chunks).toEqual([]);
    expect(r.fsm.context().finalError).toBeUndefined();
    expect(r.outcome.kind).toBe('final_error_emitted');
  });

  it('a throw AFTER a done chunk keeps the completed outcome and logs nothing extra', async () => {
    fakeClock(1000);
    const r = await run({
      translate: async ({ onChunk }) => {
        onChunk({ type: 'done', requestId: 'r1', confidence: 1 });
        throw new Error('late boom');
      },
    });
    expect(r.attemptLog).toEqual([{ backendId: ANTHROPIC, status: 'ok', latencyMs: 0 }]);
    expect(r.errors).toHaveLength(0);
    expect(r.outcome.kind).toBe('completed');
  });

  it('a throw AFTER an emitted error chunk does not double-report', async () => {
    const r = await run({
      translate: async ({ onChunk }) => {
        onChunk({ type: 'error', requestId: 'r1', code: 'REQUEST', message: 'bad request' });
        throw new Error('late boom');
      },
    });
    expect(r.errors).toEqual([
      { type: 'error', requestId: 'r1', code: 'REQUEST', message: 'bad request' },
    ]);
    expect(r.attemptLog).toHaveLength(1);
    expect(r.outcome.kind).toBe('final_error_emitted');
  });
});

describe('router-attempt — synthesized terminal', () => {
  it('a silent resolve synthesizes the exact UNKNOWN terminal into all three sinks', async () => {
    const clock = fakeClock(1000);
    const r = await run({
      translate: async () => {
        clock.set(1300);
      },
    });
    expect(r.fsm.context().finalError).toEqual({
      code: 'UNKNOWN',
      message: 'backend resolved without terminal',
    });
    expect(r.attemptLog).toEqual([
      {
        backendId: ANTHROPIC,
        status: 'error',
        code: 'UNKNOWN',
        message: 'backend resolved without terminal',
        latencyMs: 300,
      },
    ]);
    expect(r.errors).toEqual([
      {
        type: 'error',
        requestId: 'r1',
        code: 'UNKNOWN',
        message: 'backend resolved without terminal',
      },
    ]);
    expect(r.outcome.kind).toBe('final_error_emitted');
  });

  it('a user cancel suppresses the synthesized terminal', async () => {
    const source = createCancelToken();
    source.cancel('user');
    const r = await run({
      source,
      translate: async () => {},
    });
    expect(r.chunks).toEqual([]);
    expect(r.attemptLog).toEqual([]);
    expect(r.outcome.kind).toBe('final_error_emitted');
  });
});
