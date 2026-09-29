import { accumulatorInternal } from './accumulator';

/** Resets module state so each test starts clean. */
export function resetAccumulator(): void {
  accumulatorInternal.queue.length = 0;
  accumulatorInternal.listeners.clear();
  if (accumulatorInternal.ttlTimer) {
    clearTimeout(accumulatorInternal.ttlTimer);
    accumulatorInternal.ttlTimer = null;
  }
}
