import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { trackInflight, swKeepaliveInternal } from '@/background/swKeepalive';
import { swKeepaliveState } from '@tests/_helpers/swKeepalive.test-utils';

/** Refcount invariants: a leak keeps the SW awake forever, an early release drops it mid-fetch. */

describe('swKeepalive', () => {
  beforeEach(() => {
    // The counter is module state; release every slot so a prior test cannot leak.
    let safety = 100;
    while (swKeepaliveState().inflight > 0 && safety-- > 0) {
      const release = trackInflight();
      release();
      release();
    }
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts inactive', () => {
    expect(swKeepaliveState()).toEqual({ active: false, inflight: 0 });
  });

  it('first trackInflight() activates the timer', () => {
    const release = trackInflight();
    expect(swKeepaliveState()).toEqual({ active: true, inflight: 1 });
    release();
  });

  it('second concurrent trackInflight() does NOT spawn a second timer', () => {
    const r1 = trackInflight();
    const r2 = trackInflight();
    const state = swKeepaliveState();
    expect(state.active).toBe(true);
    expect(state.inflight).toBe(2);
    r1();
    r2();
  });

  it('release drops inflight and stops the timer once it reaches zero', () => {
    const r1 = trackInflight();
    const r2 = trackInflight();
    r1();
    expect(swKeepaliveState()).toEqual({ active: true, inflight: 1 });
    r2();
    expect(swKeepaliveState()).toEqual({ active: false, inflight: 0 });
  });

  it('double release is a no-op (released flag prevents double-decrement)', () => {
    const release = trackInflight();
    release();
    release();
    release();
    expect(swKeepaliveState()).toEqual({ active: false, inflight: 0 });
  });

  it('release ordering is independent — r2 then r1 still cleans up', () => {
    const r1 = trackInflight();
    const r2 = trackInflight();
    r2();
    expect(swKeepaliveState()).toEqual({ active: true, inflight: 1 });
    r1();
    expect(swKeepaliveState()).toEqual({ active: false, inflight: 0 });
  });

  it('counter never goes below zero even on excess releases', () => {
    const r = trackInflight();
    r();
    r();
    r();
    r();
    const r2 = trackInflight();
    // Should activate cleanly with inflight=1, not inflight=-3+1=-2.
    expect(swKeepaliveState()).toEqual({ active: true, inflight: 1 });
    r2();
  });

  // unref lets the vitest worker exit; the service-worker runtime ignores it.
  it('timer handle is unref()-able', () => {
    const release = trackInflight();
    const timer = swKeepaliveInternal.timer;
    expect(timer).not.toBeNull();
    expect(typeof (timer as { unref?: () => void }).unref).toBe('function');
    release();
  });
});
