import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runTranslateAttempt } from '@/background/router-attempt';
import { TRANSLATE_TIMED_OUT } from '@/background/router-chunks';
import { createTranslateFsm } from '@/background/router-fsm';
import { createCancelToken, type CancelToken } from '@/shared/cancel-token';
import { buildBackendConfig } from '@/shared/backends/build-config';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { ChatTurn } from '@/shared/chat-history';
import type { TranslationChunk, TranslationRequest } from '@/shared/types';
import { asBackendIdUnsafe, asLangIdUnsafe } from '@/shared/brands';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { testManifest } from '@tests/_helpers/backend';

/** Mutation kills for the delta / perf half of router-attempt.ts (L76-148). */

const BID = asBackendIdUnsafe('anthropic');

const noopLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

function makeReq(stream: boolean): TranslationRequest {
  return {
    id: 'r1',
    text: 'hi',
    sourceLang: 'auto',
    targetLang: asLangIdUnsafe('en'),
    options: { stream, explain: false },
  };
}

interface RunOpts {
  translate: (a: TranslateCallArgs) => Promise<void>;
  isLast?: boolean;
  streaming?: boolean;
  reqStream?: boolean;
  history?: ChatTurn[];
  cancel?: CancelToken;
}

function startRun(o: RunOpts) {
  const fsm = createTranslateFsm();
  fsm.send({ type: 'start' });
  const chunks: TranslationChunk[] = [];
  const attemptLog: Parameters<typeof runTranslateAttempt>[0]['attemptLog'] = [];
  const req = makeReq(o.reqStream ?? true);
  const promise = runTranslateAttempt({
    backend: {
      id: BID,
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: o.translate,
    },
    isLast: o.isLast ?? true,
    reqView: req,
    reqOptions: req.options,
    streaming: o.streaming ?? true,
    cfg: buildBackendConfig(DEFAULT_SETTINGS),
    system: 'sys',
    user: 'usr',
    ...(o.history ? { history: o.history } : {}),
    cancel: o.cancel ?? createCancelToken().token,
    fsm,
    attemptLog,
    reqId: 'r1',
    onChunk: (c) => chunks.push(c),
    attachMeta: (c) => c,
    logger: noopLogger,
  });
  return { promise, chunks, attemptLog, fsm };
}

async function run(o: RunOpts) {
  const s = startRun(o);
  const outcome = await s.promise;
  return { outcome, chunks: s.chunks, attemptLog: s.attemptLog, fsm: s.fsm };
}

const deltasOf = (chunks: TranslationChunk[]) => chunks.filter((c) => c.type === 'delta');
const errorsOf = (chunks: TranslationChunk[]) =>
  chunks.filter((c): c is Extract<TranslationChunk, { type: 'error' }> => c.type === 'error');

let clock = 1000;

describe('router-attempt — delta latch and attempt latency', () => {
  beforeEach(() => {
    clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the attempt latency from attempt start to done and forwards every delta', async () => {
    const r = await run({
      translate: async (a) => {
        clock = 1050;
        a.onChunk({ type: 'delta', requestId: 'r1', text: 'he' });
        clock = 1080;
        a.onChunk({ type: 'delta', requestId: 'r1', text: 'llo' });
        clock = 1200;
        a.onChunk({ type: 'done', requestId: 'r1', confidence: 1 });
      },
    });
    expect(r.outcome.kind).toBe('completed');
    expect(r.attemptLog).toEqual([{ backendId: 'anthropic', status: 'ok', latencyMs: 200 }]);
    expect(deltasOf(r.chunks)).toHaveLength(2);
  });

  it('an empty delta emits nothing and never latches the first-delta clock', async () => {
    const r = await run({
      translate: async (a) => {
        clock = 1050;
        a.onChunk({ type: 'delta', requestId: 'r1', text: '' });
        clock = 1200;
        a.onChunk({ type: 'done', requestId: 'r1', confidence: 1 });
      },
    });
    expect(deltasOf(r.chunks)).toHaveLength(0);
    expect(r.fsm.context().acc).toBe('');
    expect(r.fsm.context().firstDeltaAt).toBeUndefined();
  });

  it('clamps the audited error message to 400 chars and logs the exact error latency', async () => {
    const long = 'x'.repeat(500);
    const r = await run({
      translate: async (a) => {
        clock = 1123;
        a.onChunk({ type: 'error', requestId: 'r1', code: 'REQUEST', message: long });
      },
    });
    expect(r.attemptLog).toEqual([
      {
        backendId: 'anthropic',
        status: 'error',
        code: 'REQUEST',
        message: 'x'.repeat(400),
        latencyMs: 123,
      },
    ]);
    // The clamp is audit-only — the surfaced chunk keeps the full message.
    expect(errorsOf(r.chunks)[0]?.message).toHaveLength(500);
  });
});

describe('router-attempt — backend call arguments', () => {
  it('forwards history when present and omits the key entirely when absent', async () => {
    const history: ChatTurn[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hey' },
    ];
    const seen: TranslateCallArgs[] = [];
    const cap = async (a: TranslateCallArgs) => {
      seen.push(a);
      a.onChunk({ type: 'done', requestId: 'r1', confidence: 1 });
    };
    await run({ translate: cap, history });
    await run({ translate: cap });
    expect(seen[0] && 'history' in seen[0]).toBe(true);
    expect(seen[0]?.history).toEqual(history);
    expect(seen[1] && 'history' in seen[1]).toBe(false);
    expect(seen[1]?.history).toBeUndefined();
  });

  it('stream is the AND of request.options.stream and the streaming setting', async () => {
    const seen: boolean[] = [];
    const cap = async (a: TranslateCallArgs) => {
      seen.push(a.stream);
      a.onChunk({ type: 'done', requestId: 'r1', confidence: 1 });
    };
    await run({ translate: cap, reqStream: true, streaming: true });
    await run({ translate: cap, reqStream: false, streaming: true });
    await run({ translate: cap, reqStream: true, streaming: false });
    expect(seen).toEqual([true, false, false]);
  });
});

describe('router-attempt — abort race', () => {
  it('returns on an already-aborted signal even when the backend hangs forever', async () => {
    const { token, cancel } = createCancelToken();
    cancel('user');
    const s = startRun({
      cancel: token,
      translate: async () => {
        await new Promise<void>(() => {
          // Never resolves and ignores the signal.
        });
      },
    });
    const outcome = await Promise.race([
      s.promise,
      new Promise<{ kind: 'no-resolve' }>((r) => setTimeout(() => r({ kind: 'no-resolve' }), 200)),
    ]);
    expect(outcome.kind).toBe('final_error_emitted');
    expect(errorsOf(s.chunks)).toHaveLength(0);
  });

  it('waits for an async backend when nothing is aborted', async () => {
    const r = await run({
      translate: async (a) => {
        await new Promise<void>((res) => setTimeout(res, 0));
        a.onChunk({ type: 'done', requestId: 'r1', confidence: 1 });
      },
    });
    expect(r.outcome.kind).toBe('completed');
    expect(errorsOf(r.chunks)).toHaveLength(0);
    expect(r.attemptLog).toHaveLength(1);
    expect(r.attemptLog[0]?.status).toBe('ok');
  });

  it('registers the abort listener with { once: true }', async () => {
    const { token } = createCancelToken();
    const addSpy = vi.spyOn(token.signal, 'addEventListener');
    await run({
      cancel: token,
      translate: async (a) => {
        a.onChunk({ type: 'done', requestId: 'r1', confidence: 1 });
      },
    });
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls[0]?.[0]).toBe('abort');
    expect(addSpy.mock.calls[0]?.[2]).toEqual({ once: true });
    addSpy.mockRestore();
  });
});

describe('router-attempt — ABORTED → TIMEOUT rewrite', () => {
  it('rewrites an ABORTED chunk to TIMEOUT and skips the audit entry when the wall-clock fired', async () => {
    const { token, cancel } = createCancelToken();
    cancel('wallclock');
    const r = await run({
      cancel: token,
      translate: async (a) => {
        a.onChunk({ type: 'error', requestId: 'r1', code: 'ABORTED', message: 'aborted' });
      },
    });
    const errs = errorsOf(r.chunks);
    expect(errs).toHaveLength(1);
    expect(errs[0]?.code).toBe('TIMEOUT');
    expect(errs[0]?.message).toBe(TRANSLATE_TIMED_OUT);
    expect(errs[0]?.requestId).toBe('r1');
    expect(r.fsm.context().finalError).toEqual({
      code: 'TIMEOUT',
      message: TRANSLATE_TIMED_OUT,
    });
    // The early return skips the attempt-log push below it.
    expect(r.attemptLog).toEqual([]);
  });

  it('does not rewrite when only one half of the guard holds', async () => {
    const { token, cancel } = createCancelToken();
    cancel('wallclock');
    const wallclockNonAbort = await run({
      cancel: token,
      translate: async (a) => {
        a.onChunk({ type: 'error', requestId: 'r1', code: 'REQUEST', message: 'bad body' });
      },
    });
    expect(errorsOf(wallclockNonAbort.chunks)[0]?.code).toBe('REQUEST');
    expect(wallclockNonAbort.attemptLog).toHaveLength(1);

    const abortNoWallclock = await run({
      translate: async (a) => {
        a.onChunk({ type: 'error', requestId: 'r1', code: 'ABORTED', message: 'user cancel' });
      },
    });
    expect(errorsOf(abortNoWallclock.chunks)[0]?.code).toBe('ABORTED');
    expect(errorsOf(abortNoWallclock.chunks)[0]?.message).toBe('user cancel');
    expect(abortNoWallclock.attemptLog).toHaveLength(1);
  });
});
