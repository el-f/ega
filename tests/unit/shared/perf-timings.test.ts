import { describe, it, expect, beforeEach } from 'vitest';
import { perfRecord, perfDump, perfStart } from '@/shared/perf-timings';
import { resetPerfTimings } from '@tests/_helpers/perf-timings.test-utils';

describe('perf-ring', () => {
  beforeEach(() => {
    resetPerfTimings();
  });

  it('returns records in insertion order', () => {
    perfRecord('a', 10);
    perfRecord('b', 20);
    perfRecord('c', 30);
    expect(perfDump().map((r) => r.label)).toEqual(['a', 'b', 'c']);
  });

  it('wraps at 128 entries, keeping the newest window', () => {
    for (let i = 0; i < 130; i++) perfRecord(`e${i}`, i);
    const labels = perfDump().map((r) => r.label);
    expect(labels).toHaveLength(128);
    // Oldest entry kept is e2 (0 and 1 got overwritten).
    expect(labels[0]).toBe('e2');
    expect(labels.at(-1)).toBe('e129');
  });

  it('coerces negative / NaN durations to 0', () => {
    perfRecord('neg', -5);
    perfRecord('nan', Number.NaN);
    const out = perfDump();
    expect(out[0]?.ms).toBe(0);
    expect(out[1]?.ms).toBe(0);
  });

  it('carries optional metadata through', () => {
    perfRecord('tagged', 7, { backend: 'anthropic', ok: true });
    const r = perfDump()[0];
    expect(r?.meta).toEqual({ backend: 'anthropic', ok: true });
  });

  it('omits meta when none is passed (exactOptionalPropertyTypes)', () => {
    perfRecord('plain', 1);
    const r = perfDump()[0];
    if (!r) throw new Error('expected one record');
    expect(Object.hasOwn(r, 'meta')).toBe(false);
  });

  it('perfStart returns a stopper that records elapsed time', async () => {
    const stop = perfStart('work');
    await new Promise((r) => setTimeout(r, 10));
    const elapsed = stop({ ok: true });
    expect(elapsed).toBeGreaterThanOrEqual(1);
    const r = perfDump()[0];
    expect(r?.label).toBe('work');
    expect(r?.meta).toEqual({ ok: true });
    expect(r?.ms).toBeGreaterThanOrEqual(1);
  });
});
