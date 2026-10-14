/** One macrotask turn: lets pending timers and their promise chains run. */
export function flushAsync(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** Drains microtasks and macrotasks until the async onMount finishes; tick() only flushes microtasks. */
export async function drainAsync(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** Audit writes are fire-and-forget behind a lock; drain the microtask queue. */
export async function flushAudit(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
