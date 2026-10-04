import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { withTranslateLifecycle, LifecycleCeilingError } from '@/background/router-lifecycle';
import { trackInflight, swKeepaliveInternal } from '@/background/swKeepalive';

describe('withTranslateLifecycle', () => {
  it('registers the controller in inflight, runs op, cleans up on success', async () => {
    const inflight = new Map<string, AbortController>();
    const cancelRequested = new Set<string>();
    const release = vi.fn();
    const trackInflight = vi.fn(() => release);
    let observedCtrl: AbortController | undefined;
    const result = await withTranslateLifecycle(
      { reqId: 'a', inflight, cancelRequested, trackInflight },
      async (ctx) => {
        observedCtrl = ctx.ctrl;
        expect(inflight.get('a')).toBe(ctx.ctrl);
        return 42;
      },
    );
    expect(result).toBe(42);
    expect(inflight.has('a')).toBe(false);
    expect(observedCtrl?.signal.aborted).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('aborts the prior controller for the same id before running op', async () => {
    const inflight = new Map<string, AbortController>();
    const prior = new AbortController();
    inflight.set('a', prior);
    const cancelRequested = new Set<string>();
    const trackInflight = () => () => {};
    await withTranslateLifecycle(
      { reqId: 'a', inflight, cancelRequested, trackInflight },
      async () => 0,
    );
    expect(prior.signal.aborted).toBe(true);
  });

  it('drains cancelRequested pre-registration and aborts the new controller', async () => {
    const inflight = new Map<string, AbortController>();
    const cancelRequested = new Set<string>(['a']);
    const trackInflight = () => () => {};
    let aborted = false;
    await withTranslateLifecycle(
      { reqId: 'a', inflight, cancelRequested, trackInflight },
      async (ctx) => {
        aborted = ctx.ctrl.signal.aborted;
        return 0;
      },
    );
    expect(aborted).toBe(true);
    expect(cancelRequested.has('a')).toBe(false);
  });

  it('releases keepalive and inflight on thrown error', async () => {
    const inflight = new Map<string, AbortController>();
    const cancelRequested = new Set<string>();
    const release = vi.fn();
    const trackInflight = vi.fn(() => release);
    await expect(
      withTranslateLifecycle({ reqId: 'a', inflight, cancelRequested, trackInflight }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(release).toHaveBeenCalledTimes(1);
    expect(inflight.has('a')).toBe(false);
  });

  it('leaves a newer controller for the same id in inflight when the older one unwinds', async () => {
    const inflight = new Map<string, AbortController>();
    const cancelRequested = new Set<string>();
    const trackInflight = () => () => {};
    let releaseFirst: (() => void) | undefined;

    const first = withTranslateLifecycle(
      { reqId: 'a', inflight, cancelRequested, trackInflight },
      async () => {
        await new Promise<void>((r) => (releaseFirst = r));
      },
    );
    let secondCtrl: AbortController | undefined;
    let releaseSecond: (() => void) | undefined;
    const second = withTranslateLifecycle(
      { reqId: 'a', inflight, cancelRequested, trackInflight },
      async (ctx) => {
        secondCtrl = ctx.ctrl;
        await new Promise<void>((r) => (releaseSecond = r));
      },
    );

    releaseFirst?.();
    await first;

    // The second run is still live, so canceling by id must still reach it.
    expect(inflight.get('a')).toBe(secondCtrl);
    inflight.get('a')?.abort();
    expect(secondCtrl?.signal.aborted).toBe(true);

    releaseSecond?.();
    await second;
    expect(inflight.has('a')).toBe(false);
  });

  it('does not abort sibling ids in inflight', async () => {
    const inflight = new Map<string, AbortController>();
    const sibling = new AbortController();
    inflight.set('b', sibling);
    const cancelRequested = new Set<string>();
    const trackInflight = () => () => {};
    await withTranslateLifecycle(
      { reqId: 'a', inflight, cancelRequested, trackInflight },
      async () => 0,
    );
    expect(sibling.signal.aborted).toBe(false);
    expect(inflight.has('b')).toBe(true);
  });
});

describe('withTranslateLifecycle — hard ceiling', () => {
  beforeEach(() => {
    // Drain any stale keepalive state from prior tests.
    let safety = 100;
    while (swKeepaliveInternal.inflightCount > 0 && safety-- > 0) {
      const r = trackInflight();
      r();
    }
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('force-releases keepalive and inflight when op never settles', async () => {
    const inflight = new Map<string, AbortController>();
    const cancelRequested = new Set<string>();
    const CEILING_MS = 50;

    const promise = withTranslateLifecycle(
      {
        reqId: 'ceiling-test',
        inflight,
        cancelRequested,
        trackInflight,
        maxLifecycleMs: CEILING_MS,
      },
      () =>
        new Promise<never>(() => {
          /* never settles, ignores abort */
        }),
    );

    // Before ceiling fires: inflight registered, keepalive active.
    expect(inflight.has('ceiling-test')).toBe(true);
    expect(swKeepaliveInternal.inflightCount).toBeGreaterThan(0);

    // Attach rejection handler BEFORE advancing timers so the promise is never
    // in an "unhandled rejection" state when the ceiling fires.
    const rejection = promise.catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(CEILING_MS + 1);

    const err = await rejection;
    expect(err).toBeInstanceOf(LifecycleCeilingError);

    // After ceiling: lifecycle cleaned up.
    expect(inflight.has('ceiling-test')).toBe(false);
    expect(swKeepaliveInternal.inflightCount).toBe(0);
    expect(swKeepaliveInternal.timer).toBeNull();
  });

  it('ceiling does not fire when op settles normally before the deadline', async () => {
    const inflight = new Map<string, AbortController>();
    const cancelRequested = new Set<string>();

    const result = await withTranslateLifecycle(
      { reqId: 'fast-op', inflight, cancelRequested, trackInflight, maxLifecycleMs: 5_000 },
      async () => 99,
    );

    expect(result).toBe(99);
    expect(inflight.has('fast-op')).toBe(false);
    expect(swKeepaliveInternal.inflightCount).toBe(0);
  });

  it('clears the ceiling timer when the op settles, leaving nothing pending', async () => {
    const before = vi.getTimerCount();

    await withTranslateLifecycle(
      {
        reqId: 'no-leak',
        inflight: new Map(),
        cancelRequested: new Set(),
        trackInflight,
        maxLifecycleMs: 5_000,
      },
      async () => 1,
    );

    expect(vi.getTimerCount()).toBe(before);
  });

  it('the ceiling error names itself, so a log line says which ceiling fired', () => {
    const err = new LifecycleCeilingError();

    expect(err.name).toBe('LifecycleCeilingError');
    expect(err.message).toContain('lifecycle ceiling exceeded');
    expect(err.message).toContain('force-releasing');
  });
});
