import { debugCatch } from '@/shared/logger';
interface AccumulatedSelection {
  text: string;
  rect: DOMRect;
  addedAt: number;
}

const TTL_MS = 90_000;

// Exported only so the sibling test-utils module can reset it; production callers use the functions below.
export const accumulatorInternal: {
  queue: AccumulatedSelection[];
  listeners: Set<() => void>;
  ttlTimer: ReturnType<typeof setTimeout> | null;
} = {
  queue: [],
  listeners: new Set(),
  ttlTimer: null,
};
const { queue, listeners } = accumulatorInternal;

function scheduleTtl(): void {
  if (accumulatorInternal.ttlTimer) clearTimeout(accumulatorInternal.ttlTimer);
  accumulatorInternal.ttlTimer = setTimeout(() => {
    if (queue.length > 0) clear();
  }, TTL_MS);
}

function emit(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch (e) {
      debugCatch(e, 'content.accumulator.1');
    }
  }
}

export function add(entry: Omit<AccumulatedSelection, 'addedAt'>): number {
  queue.push({ ...entry, addedAt: Date.now() });
  scheduleTtl();
  emit();
  return queue.length;
}

export function clear(): void {
  if (queue.length === 0) {
    if (accumulatorInternal.ttlTimer) {
      clearTimeout(accumulatorInternal.ttlTimer);
      accumulatorInternal.ttlTimer = null;
    }
    return;
  }
  queue.length = 0;
  if (accumulatorInternal.ttlTimer) {
    clearTimeout(accumulatorInternal.ttlTimer);
    accumulatorInternal.ttlTimer = null;
  }
  emit();
}

export function list(): ReadonlyArray<AccumulatedSelection> {
  return queue;
}

export function size(): number {
  return queue.length;
}

const JOIN_SEPARATOR = '\n\n---\n\n';

/** Joins queued selections up to the request cap and reports how many did not fit, so nothing is cut in silence. */
export function joinCapped(
  parts: readonly string[],
  cap: number,
): { text: string; dropped: number } {
  const kept: string[] = [];
  let used = 0;
  for (const part of parts) {
    const cost = (kept.length > 0 ? JOIN_SEPARATOR.length : 0) + part.length;
    if (kept.length > 0 && used + cost > cap) break;
    kept.push(part);
    used += cost;
  }
  // A lone selection longer than the cap still goes out truncated — dropping it outright helps nobody.
  return { text: kept.join(JOIN_SEPARATOR).slice(0, cap), dropped: parts.length - kept.length };
}

export function onChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
