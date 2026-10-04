import { describe, it, expect, beforeEach } from 'vitest';
import {
  PERF_BUFFER_MAX,
  clearPerfBuffer,
  computePercentiles,
  getPerfEntries,
  pushPerfEntry,
} from '@/shared/perf-history';
import type { ResultMeta } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';

function meta(latencyMs: number, overrides: Partial<ResultMeta> = {}): ResultMeta {
  return {
    backendId: asBackendIdUnsafe('anthropic'),
    cacheHit: false,
    latencyMs,
    ...overrides,
  };
}

describe('perf-buffer', () => {
  beforeEach(() => {
    clearPerfBuffer();
  });

  it('starts empty', () => {
    expect(getPerfEntries()).toHaveLength(0);
  });

  it('pushPerfEntry appends + stamps ts', () => {
    pushPerfEntry(meta(100));
    const entries = getPerfEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.latencyMs).toBe(100);
    expect(typeof entries[0]?.ts).toBe('number');
  });

  it('evicts the oldest entry once above the cap', () => {
    for (let i = 0; i < PERF_BUFFER_MAX + 10; i++) {
      pushPerfEntry(meta(i));
    }
    const entries = getPerfEntries();
    expect(entries).toHaveLength(PERF_BUFFER_MAX);
    // Oldest 10 should have been evicted — first retained entry is #10.
    expect(entries[0]?.latencyMs).toBe(10);
    expect(entries.at(-1)?.latencyMs).toBe(PERF_BUFFER_MAX + 9);
  });

  it('clearPerfBuffer wipes', () => {
    pushPerfEntry(meta(100));
    pushPerfEntry(meta(200));
    clearPerfBuffer();
    expect(getPerfEntries()).toHaveLength(0);
  });

  it('computePercentiles returns zeros + n=0 on empty buffer', () => {
    expect(computePercentiles()).toEqual({ p50: 0, p95: 0, n: 0 });
  });

  it('computePercentiles accepts an explicit entries array (options-page path)', () => {
    const entries = [1, 2, 3, 4, 5].map((latencyMs) => ({ ...meta(latencyMs), ts: 0 }));
    const { p50, n } = computePercentiles(entries);
    expect(n).toBe(5);
    expect(p50).toBe(3);
    // The instance buffer stays untouched.
    expect(getPerfEntries()).toHaveLength(0);
  });

  it('computePercentiles returns sensible values on 100 entries', () => {
    // Latencies 1..100 → p50 around mid-range, p95 near top.
    for (let i = 1; i <= 100; i++) pushPerfEntry(meta(i));
    const { p50, p95, n } = computePercentiles();
    expect(n).toBe(100);
    // floor(99 * 0.5) = 49 → sorted[49] = 50
    expect(p50).toBe(50);
    // floor(99 * 0.95) = 94 → sorted[94] = 95
    expect(p95).toBe(95);
  });

  it('computePercentiles handles a single entry', () => {
    pushPerfEntry(meta(42));
    const { p50, p95, n } = computePercentiles();
    expect(n).toBe(1);
    expect(p50).toBe(42);
    expect(p95).toBe(42);
  });
});
