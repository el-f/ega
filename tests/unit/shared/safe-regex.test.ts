import { describe, it, expect } from 'vitest';
import { safeTest } from '@/shared/safe-regex';

describe('safeTest', () => {
  it('returns true when a well-behaved regex matches', () => {
    const ban = new Set<string>();
    expect(safeTest('hello', '', 'hello world', { bannedSet: ban })).toBe(true);
    expect(ban.size).toBe(0);
  });

  it('returns false when a well-behaved regex does not match', () => {
    const ban = new Set<string>();
    expect(safeTest('^world$', '', 'hello world', { bannedSet: ban })).toBe(false);
    expect(ban.size).toBe(0);
  });

  it('returns false without throwing on invalid patterns (compile error)', () => {
    const ban = new Set<string>();
    const called = safeTest('(', '', 'text', { bannedSet: ban });
    expect(called).toBe(false);
    expect(ban.size).toBe(0); // compile errors are not banned.
  });

  it('caps input length before running', () => {
    const ban = new Set<string>();
    // The X sits past the 1024 cap, so the truncated input has no match.
    const longHaystack = 'a'.repeat(2000) + 'X';
    expect(safeTest('X$', '', longHaystack, { inputCap: 1024, bannedSet: ban })).toBe(false);
    expect(safeTest('X$', '', 'hello X', { inputCap: 1024, bannedSet: ban })).toBe(true);
  });

  it('bans a regex whose .test() exceeded the threshold and short-circuits', () => {
    const ban = new Set<string>();
    const banned: string[] = [];
    // Fake clock jumps 100 ms between the start and end of .test().
    let tick = 0;
    const now = (): number => {
      const v = tick;
      tick += 100;
      return v;
    };
    const onBan = (r: 'slow' | 'threw'): void => void banned.push(r);
    safeTest('hello', '', 'hello world', {
      bannedSet: ban,
      banThresholdMs: 50,
      now,
      onBan,
    });
    expect(ban.size).toBe(1);
    expect(banned).toEqual(['slow']);
    const result = safeTest('hello', '', 'hello world', {
      bannedSet: ban,
      banThresholdMs: 50,
      now,
    });
    expect(result).toBe(false);
    expect(banned).toEqual(['slow']); // onBan fired only once.
  });

  it('returns the legitimate match on the first slow call (pay-once-then-ban)', () => {
    const ban = new Set<string>();
    let tick = 0;
    const now = (): number => {
      const v = tick;
      tick += 200;
      return v;
    };
    // The engine already ran, so the first call still returns the real answer before the ban.
    const result = safeTest('hello', '', 'hello world', {
      bannedSet: ban,
      banThresholdMs: 50,
      now,
    });
    expect(result).toBe(true);
    expect(ban.size).toBe(1);
  });

  it('catastrophic backtrack pattern bans on first call, short-circuits after', () => {
    const ban = new Set<string>();
    let tick = 0;
    const now = (): number => {
      const v = tick;
      tick += 60; // above threshold.
      return v;
    };
    // Short input so the real first call cannot hang the test.
    const input = 'a'.repeat(8) + 'c';
    safeTest('(a+)+b', '', input, { bannedSet: ban, now });
    expect(ban.has('(a+)+b\x01')).toBe(true);
    // This input would hang the engine, so a fast return proves .test() never ran.
    const hostile = 'a'.repeat(40) + 'c';
    const t0 = Date.now();
    const result2 = safeTest('(a+)+b', '', hostile, { bannedSet: ban });
    const elapsed = Date.now() - t0;
    expect(result2).toBe(false);
    expect(elapsed).toBeLessThan(100);
  });

  it('different regex+flags combinations are tracked independently', () => {
    const ban = new Set<string>();
    let tick = 0;
    const now = (): number => {
      const v = tick;
      tick += 100;
      return v;
    };
    safeTest('foo', '', 'foo', { bannedSet: ban, now, banThresholdMs: 50 });
    // Same pattern, different flags — separate entry.
    safeTest('foo', 'i', 'foo', { bannedSet: ban, now, banThresholdMs: 50 });
    expect(ban.size).toBe(2);
  });
});
