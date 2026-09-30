// Brave, and sometimes Chrome, suspends an MV3 worker mid-fetch while timers keep running on wall clock, so the router's budget fires against a paused request.

const KEEPALIVE_INTERVAL_MS = 20_000;

/** Exported so tests can snapshot it; prod callers ignore this. */
export const swKeepaliveInternal: {
  timer: ReturnType<typeof setInterval> | null;
  inflightCount: number;
} = {
  timer: null,
  inflightCount: 0,
};

function ping(): void {
  // The result is discarded — making the call is what resets the worker's idle timer.
  try {
    chrome.runtime.getPlatformInfo().catch(() => {
      /* swallow — keepalive is best-effort */
    });
  } catch {
    /* runtime may be missing in tests */
  }
}

export function trackInflight(): () => void {
  swKeepaliveInternal.inflightCount += 1;
  if (swKeepaliveInternal.timer === null) {
    ping(); // immediate first ping so a quick translate still gets a tap
    swKeepaliveInternal.timer = setInterval(ping, KEEPALIVE_INTERVAL_MS);
    // unref lets a node test harness exit; the worker runtime has no unref and ignores it.
    (swKeepaliveInternal.timer as { unref?: () => void }).unref?.();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    swKeepaliveInternal.inflightCount = Math.max(0, swKeepaliveInternal.inflightCount - 1);
    if (swKeepaliveInternal.inflightCount === 0 && swKeepaliveInternal.timer !== null) {
      clearInterval(swKeepaliveInternal.timer);
      swKeepaliveInternal.timer = null;
    }
  };
}
