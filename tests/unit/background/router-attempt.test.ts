import { describe, it, expect, vi } from 'vitest';
import { runTranslateAttempt } from '@/background/router-attempt';
import { createTranslateFsm } from '@/background/router-fsm';
import { createCancelToken } from '@/shared/cancel-token';
import { buildBackendConfig } from '@/shared/backends/build-config';
import type { TranslateCallArgs, TranslationBackend } from '@/shared/backends/base';
import type { BackendId, TranslationChunk, TranslationRequest } from '@/shared/types';
import { asBackendIdUnsafe, asLangIdUnsafe } from '@/shared/brands';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { testManifest } from '@tests/_helpers/backend';

function makeReq(): TranslationRequest {
  return {
    id: 'r1',
    text: 'hi',
    sourceLang: 'auto',
    targetLang: asLangIdUnsafe('en'),
    options: { stream: false, explain: false },
  };
}

const makeCfg = () => buildBackendConfig(DEFAULT_SETTINGS);

function makeBackend(
  id: BackendId,
  translateImpl: (args: TranslateCallArgs) => Promise<void>,
): TranslationBackend {
  return {
    id,
    manifest: testManifest(id),
    isAvailable: async () => true,
    translate: translateImpl,
  };
}

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('runTranslateAttempt', () => {
  it('synthesizes an UNKNOWN error chunk when the backend resolves silently', async () => {
    // A backend that resolves with no terminal chunk would leave the UI loading forever.
    const onChunk = vi.fn();
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    const { token } = createCancelToken();
    const backend = makeBackend(asBackendIdUnsafe('anthropic'), async () => {
      // Silent resolve — no chunks emitted.
    });
    const attemptLog: Parameters<typeof runTranslateAttempt>[0]['attemptLog'] = [];
    const outcome = await runTranslateAttempt({
      backend,
      isLast: true,
      reqView: makeReq(),
      reqOptions: makeReq().options,
      streaming: false,
      cfg: makeCfg(),
      system: 'sys',
      user: 'usr',
      cancel: token,
      fsm,
      attemptLog,
      reqId: 'r1',
      onChunk,
      attachMeta: (c) => c,
      logger: noopLogger,
    });
    expect(outcome.kind).toBe('final_error_emitted');
    // Audit got the failure entry.
    expect(attemptLog).toHaveLength(1);
    expect(attemptLog[0]?.status).toBe('error');
    expect(attemptLog[0]?.code).toBe('UNKNOWN');
    // UI saw a terminal error chunk.
    const errCalls = onChunk.mock.calls.filter((c) => (c[0] as TranslationChunk).type === 'error');
    expect(errCalls).toHaveLength(1);
    const errChunk = errCalls[0]?.[0] as Extract<TranslationChunk, { type: 'error' }>;
    expect(errChunk.code).toBe('UNKNOWN');
    expect(errChunk.requestId).toBe('r1');
    // The panel names the backend that failed, so the user knows which key or model to fix.
    expect(errChunk.backendId).toBe('anthropic');
  });

  it('does NOT synth an UNKNOWN error on a USER cancel (only on a genuine no-terminal backend)', async () => {
    // The synthetic UNKNOWN is for a misbehaving backend, never for a user cancel.
    const onChunk = vi.fn();
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    const { token, cancel: cancelFn } = createCancelToken();
    cancelFn('user');
    const backend = makeBackend(asBackendIdUnsafe('anthropic'), async () => {
      // Resolves without a terminal chunk — the user already canceled.
    });
    await runTranslateAttempt({
      backend,
      isLast: true,
      reqView: makeReq(),
      reqOptions: makeReq().options,
      streaming: false,
      cfg: makeCfg(),
      system: 'sys',
      user: 'usr',
      cancel: token,
      fsm,
      attemptLog: [],
      reqId: 'r1',
      onChunk,
      attachMeta: (c) => c,
      logger: noopLogger,
    });
    const errCalls = onChunk.mock.calls.filter((c) => (c[0] as TranslationChunk).type === 'error');
    expect(errCalls).toHaveLength(0);
  });

  it('surfaces a terminal error chunk when the backend THROWS (isLast)', async () => {
    // A translate() that rejects must still produce a terminal chunk.
    const onChunk = vi.fn();
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    const { token } = createCancelToken();
    const backend = makeBackend(asBackendIdUnsafe('anthropic'), async () => {
      throw new Error('socket hang up');
    });
    const attemptLog: Parameters<typeof runTranslateAttempt>[0]['attemptLog'] = [];
    const outcome = await runTranslateAttempt({
      backend,
      isLast: true,
      reqView: makeReq(),
      reqOptions: makeReq().options,
      streaming: false,
      cfg: makeCfg(),
      system: 'sys',
      user: 'usr',
      cancel: token,
      fsm,
      attemptLog,
      reqId: 'r1',
      onChunk,
      attachMeta: (c) => c,
      logger: noopLogger,
    });
    expect(outcome.kind).toBe('final_error_emitted');
    expect(attemptLog).toHaveLength(1);
    expect(attemptLog[0]?.status).toBe('error');
    const errCalls = onChunk.mock.calls.filter((c) => (c[0] as TranslationChunk).type === 'error');
    expect(errCalls).toHaveLength(1);
    expect((errCalls[0]?.[0] as Extract<TranslationChunk, { type: 'error' }>).code).toBe('UNKNOWN');
    expect((errCalls[0]?.[0] as Extract<TranslationChunk, { type: 'error' }>).backendId).toBe(
      'anthropic',
    );
  });

  it('falls through to the next backend when translate() THROWS and not last', async () => {
    const onChunk = vi.fn();
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    const { token } = createCancelToken();
    const backend = makeBackend(asBackendIdUnsafe('anthropic'), async () => {
      throw new Error('connect ECONNREFUSED');
    });
    const attemptLog: Parameters<typeof runTranslateAttempt>[0]['attemptLog'] = [];
    const outcome = await runTranslateAttempt({
      backend,
      isLast: false,
      reqView: makeReq(),
      reqOptions: makeReq().options,
      streaming: false,
      cfg: makeCfg(),
      system: 'sys',
      user: 'usr',
      cancel: token,
      fsm,
      attemptLog,
      reqId: 'r1',
      onChunk,
      attachMeta: (c) => c,
      logger: noopLogger,
    });
    expect(outcome.kind).toBe('transient_error_falling_through');
    // No terminal surfaced (the next backend gets its turn); audit still logged.
    const errCalls = onChunk.mock.calls.filter((c) => (c[0] as TranslationChunk).type === 'error');
    expect(errCalls).toHaveLength(0);
    expect(attemptLog).toHaveLength(1);
    expect(attemptLog[0]?.status).toBe('error');
  });

  it('Promise.race unblocks when backend ignores cancel signal (wallclock fires)', async () => {
    // A backend that never returns or emits must still end when the wall clock fires.
    const onChunk = vi.fn();
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    const { token, cancel: cancelFn } = createCancelToken();
    let backendReleased = false;
    const backend = makeBackend(asBackendIdUnsafe('anthropic'), async () => {
      // Hang forever — never resolves, ignores signal.
      await new Promise<void>(() => {
        // Track that the call started; we never resolve it.
        backendReleased = true;
      });
    });
    const outcomePromise = runTranslateAttempt({
      backend,
      isLast: true,
      reqView: makeReq(),
      reqOptions: makeReq().options,
      streaming: false,
      cfg: makeCfg(),
      system: 'sys',
      user: 'usr',
      cancel: token,
      fsm,
      attemptLog: [],
      reqId: 'r1',
      onChunk,
      attachMeta: (c) => c,
      logger: noopLogger,
    });
    // Yield so the backend invocation starts.
    await new Promise((r) => setTimeout(r, 0));
    expect(backendReleased).toBe(true);
    // Wallclock fires — abort-race unblocks the outer await.
    cancelFn('wallclock');
    const outcome = await Promise.race([
      outcomePromise,
      new Promise<{ kind: 'no-resolve' }>((r) => setTimeout(() => r({ kind: 'no-resolve' }), 200)),
    ]);
    expect(outcome.kind).not.toBe('no-resolve');
    // wallclock route — router's finally block owns the synth-TIMEOUT;
    // runTranslateAttempt only needs to return so it can.
    expect(outcome.kind).toBe('final_error_emitted');
  });

  it('strips <think> blocks from the visible delta stream (split across deltas)', async () => {
    const onChunk = vi.fn();
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    const { token } = createCancelToken();
    const backend = makeBackend(asBackendIdUnsafe('anthropic'), async (args) => {
      // Reasoning model emits a scratchpad before the JSON, split mid-tag.
      args.onChunk({ type: 'delta', requestId: 'r1', text: '<thi' });
      args.onChunk({ type: 'delta', requestId: 'r1', text: 'nk>secret reasoning</think>' });
      args.onChunk({ type: 'delta', requestId: 'r1', text: '{"translation":"hi"}' });
      args.onChunk({ type: 'done', requestId: 'r1', confidence: 0.9 });
    });
    await runTranslateAttempt({
      backend,
      isLast: true,
      reqView: makeReq(),
      reqOptions: makeReq().options,
      streaming: true,
      cfg: makeCfg(),
      system: 'sys',
      user: 'usr',
      cancel: token,
      fsm,
      attemptLog: [],
      reqId: 'r1',
      onChunk,
      attachMeta: (c) => c,
      logger: noopLogger,
    });
    const deltaText = onChunk.mock.calls
      .map((c) => c[0] as TranslationChunk)
      .filter((c): c is Extract<TranslationChunk, { type: 'delta' }> => c.type === 'delta')
      .map((c) => c.text)
      .join('');
    // No reasoning or JSON envelope reaches the visible stream.
    expect(deltaText).toBe('hi');
    expect(deltaText).not.toContain('secret');
    expect(deltaText).not.toContain('<thi');
    // FSM accumulator (feeds cached/audited final) is scrubbed too.
    expect(fsm.context().acc).toBe('hi');
  });

  it('passes normal delta output through untouched (no tags)', async () => {
    const onChunk = vi.fn();
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    const { token } = createCancelToken();
    const backend = makeBackend(asBackendIdUnsafe('anthropic'), async (args) => {
      args.onChunk({ type: 'delta', requestId: 'r1', text: '{"transl' });
      args.onChunk({ type: 'delta', requestId: 'r1', text: 'ation":"hello"}' });
      args.onChunk({ type: 'done', requestId: 'r1', confidence: 0.8 });
    });
    await runTranslateAttempt({
      backend,
      isLast: true,
      reqView: makeReq(),
      reqOptions: makeReq().options,
      streaming: true,
      cfg: makeCfg(),
      system: 'sys',
      user: 'usr',
      cancel: token,
      fsm,
      attemptLog: [],
      reqId: 'r1',
      onChunk,
      attachMeta: (c) => c,
      logger: noopLogger,
    });
    const deltaText = onChunk.mock.calls
      .map((c) => c[0] as TranslationChunk)
      .filter((c): c is Extract<TranslationChunk, { type: 'delta' }> => c.type === 'delta')
      .map((c) => c.text)
      .join('');
    expect(deltaText).toBe('hello');
    expect(fsm.context().acc).toBe('hello');
  });

  it('does not synth when the backend emits a real terminal', async () => {
    const onChunk = vi.fn();
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    const { token } = createCancelToken();
    const backend = makeBackend(asBackendIdUnsafe('anthropic'), async (args) => {
      args.onChunk({
        type: 'error',
        requestId: 'r1',
        code: 'AUTH',
        message: 'no key',
      });
    });
    const outcome = await runTranslateAttempt({
      backend,
      isLast: true,
      reqView: makeReq(),
      reqOptions: makeReq().options,
      streaming: false,
      cfg: makeCfg(),
      system: 'sys',
      user: 'usr',
      cancel: token,
      fsm,
      attemptLog: [],
      reqId: 'r1',
      onChunk,
      attachMeta: (c) => c,
      logger: noopLogger,
    });
    expect(outcome.kind).toBe('final_error_emitted');
    const errCalls = onChunk.mock.calls.filter((c) => (c[0] as TranslationChunk).type === 'error');
    // Exactly one error chunk — the backend's, not a synth.
    expect(errCalls).toHaveLength(1);
    expect((errCalls[0]?.[0] as Extract<TranslationChunk, { type: 'error' }>).code).toBe('AUTH');
    expect((errCalls[0]?.[0] as Extract<TranslationChunk, { type: 'error' }>).backendId).toBe(
      'anthropic',
    );
  });

  it('falls through on AUTH when not the last backend (rotate policy)', async () => {
    // AUTH rotates: the next backend's key may work.
    const onChunk = vi.fn();
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    const { token } = createCancelToken();
    const backend = makeBackend(asBackendIdUnsafe('anthropic'), async (args) => {
      args.onChunk({ type: 'error', requestId: 'r1', code: 'AUTH', message: 'no key' });
    });
    const attemptLog: Parameters<typeof runTranslateAttempt>[0]['attemptLog'] = [];
    const outcome = await runTranslateAttempt({
      backend,
      isLast: false,
      reqView: makeReq(),
      reqOptions: makeReq().options,
      streaming: false,
      cfg: makeCfg(),
      system: 'sys',
      user: 'usr',
      cancel: token,
      fsm,
      attemptLog,
      reqId: 'r1',
      onChunk,
      attachMeta: (c) => c,
      logger: noopLogger,
    });
    expect(outcome.kind).toBe('transient_error_falling_through');
    const errCalls = onChunk.mock.calls.filter((c) => (c[0] as TranslationChunk).type === 'error');
    expect(errCalls).toHaveLength(0);
  });

  it('does NOT rotate after visible text — NETWORK error post-delta surfaces as final_error_emitted', async () => {
    // Invariant: sawDeltas === true blocks rotation even for rotatable codes.
    // A user who saw partial text must not be silently handed to the next backend.
    const onChunk = vi.fn();
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    const { token } = createCancelToken();
    const backend = makeBackend(asBackendIdUnsafe('anthropic'), async (args) => {
      args.onChunk({ type: 'delta', requestId: 'r1', text: 'partial' });
      args.onChunk({ type: 'error', requestId: 'r1', code: 'NETWORK', message: 'conn reset' });
    });
    const attemptLog: Parameters<typeof runTranslateAttempt>[0]['attemptLog'] = [];
    const outcome = await runTranslateAttempt({
      backend,
      isLast: false,
      reqView: makeReq(),
      reqOptions: makeReq().options,
      streaming: true,
      cfg: makeCfg(),
      system: 'sys',
      user: 'usr',
      cancel: token,
      fsm,
      attemptLog,
      reqId: 'r1',
      onChunk,
      attachMeta: (c) => c,
      logger: noopLogger,
    });
    expect(outcome.kind).toBe('final_error_emitted');
    const errCalls = onChunk.mock.calls.filter((c) => (c[0] as TranslationChunk).type === 'error');
    expect(errCalls).toHaveLength(1);
    expect((errCalls[0]?.[0] as Extract<TranslationChunk, { type: 'error' }>).code).toBe('NETWORK');
  });

  it('does NOT fall through on REQUEST even when not last — same prompt re-fails', async () => {
    const onChunk = vi.fn();
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    const { token } = createCancelToken();
    const backend = makeBackend(asBackendIdUnsafe('anthropic'), async (args) => {
      args.onChunk({ type: 'error', requestId: 'r1', code: 'REQUEST', message: 'bad request' });
    });
    const outcome = await runTranslateAttempt({
      backend,
      isLast: false,
      reqView: makeReq(),
      reqOptions: makeReq().options,
      streaming: false,
      cfg: makeCfg(),
      system: 'sys',
      user: 'usr',
      cancel: token,
      fsm,
      attemptLog: [],
      reqId: 'r1',
      onChunk,
      attachMeta: (c) => c,
      logger: noopLogger,
    });
    expect(outcome.kind).toBe('final_error_emitted');
    const errCalls = onChunk.mock.calls.filter((c) => (c[0] as TranslationChunk).type === 'error');
    expect(errCalls).toHaveLength(1);
    expect((errCalls[0]?.[0] as Extract<TranslationChunk, { type: 'error' }>).code).toBe('REQUEST');
  });
});
