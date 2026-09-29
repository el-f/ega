import { describe, it, expect } from 'vitest';
import { AntiLoop } from './anti-loop';

describe('AntiLoop', () => {
  it('flags on the third identical record in a row', () => {
    const al = new AntiLoop({ window: 5, threshold: 3 });
    expect(al.record({ a: 1 })).toBe(false);
    expect(al.record({ a: 1 })).toBe(false);
    expect(al.record({ a: 1 })).toBe(true);
  });

  it('resets when a different hash arrives', () => {
    const al = new AntiLoop({ window: 5, threshold: 3 });
    al.record('A');
    al.record('A');
    al.record('B');
    expect(al.record('A')).toBe(false);
  });

  it('window evicts old hashes', () => {
    const al = new AntiLoop({ window: 3, threshold: 3 });
    al.record('A');
    al.record('A');
    // 3rd identical at window edge — should still flag.
    expect(al.record('A')).toBe(true);
    // A different one then 2 identical doesn't flag because the slot is fresh.
    al.record('B');
    expect(al.record('B')).toBe(false);
  });

  it('differentiates by structural shape, not reference', () => {
    const al = new AntiLoop({ window: 5, threshold: 3 });
    expect(al.record({ x: 1 })).toBe(false);
    expect(al.record({ x: 1 })).toBe(false);
    expect(al.record({ x: 1 })).toBe(true);
  });

  it('does not flag below threshold', () => {
    const al = new AntiLoop({ window: 5, threshold: 4 });
    expect(al.record('A')).toBe(false);
    expect(al.record('A')).toBe(false);
    expect(al.record('A')).toBe(false);
    expect(al.record('A')).toBe(true);
  });
});
