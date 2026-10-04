// In-memory only. A service-worker restart clears the buffer.
import type { ResultMeta } from './types';

export const PERF_BUFFER_MAX = 128;

export interface PerfEntry extends ResultMeta {
  /** Epoch ms at capture time. */
  ts: number;
  /** Error code when the request failed; percentiles skip these rows. */
  error?: string;
}

let buffer: PerfEntry[] = [];

/** Appends one entry, evicting the oldest once the cap is reached. */
export function pushPerfEntry(meta: ResultMeta & { error?: string }): void {
  buffer.push({ ...meta, ts: Date.now() });
  if (buffer.length > PERF_BUFFER_MAX) {
    buffer = buffer.slice(-PERF_BUFFER_MAX);
  }
}

/** Snapshot of the current buffer, oldest first. */
export function getPerfEntries(): readonly PerfEntry[] {
  return buffer;
}

export function clearPerfBuffer(): void {
  buffer = [];
}

/** Latency percentiles; all zero when empty. Defaults to this instance's buffer. */
export function computePercentiles(entries: readonly PerfEntry[] = buffer): {
  p50: number;
  p95: number;
  n: number;
} {
  const ok = entries.filter((e) => e.error === undefined);
  if (ok.length === 0) return { p50: 0, p95: 0, n: 0 };
  const sorted = ok.map((e) => e.latencyMs).sort((a, b) => a - b);
  const pick = (q: number): number => {
    const idx = Math.floor((sorted.length - 1) * q);
    return sorted[idx] ?? 0;
  };
  return { p50: pick(0.5), p95: pick(0.95), n: sorted.length };
}
