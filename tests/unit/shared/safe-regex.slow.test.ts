import { describe, it, expect } from 'vitest';
import { isSlowPattern } from '@/shared/regex-risk';
import { BUILT_IN_PRESETS } from '@/shared/presets';

describe('isSlowPattern', () => {
  // Polynomial shapes the nested-repeat check alone lets through, at a degree that is slow on any machine.
  it.each(['.*a.*a.*a.*\\d', '\\w*\\s?\\w*\\s?\\w*\\s?\\w*!', '(a+)+', '(\\w|\\d)+x'])(
    'refuses %s',
    (pattern) => {
      expect(isSlowPattern(pattern, 'i')).toBe(true);
    },
  );

  it.each(['\\b[a-z]+[2356789][a-z]*\\b', 'kif|halak|shu', '\\bya\\s+[a-z]+'])(
    'keeps %s',
    (pattern) => {
      expect(isSlowPattern(pattern, 'i')).toBe(false);
    },
  );

  it('keeps every pattern ega ships', () => {
    for (const p of BUILT_IN_PRESETS) {
      if (p.autoDetect) expect(isSlowPattern(p.autoDetect.regex, p.autoDetect.flags)).toBe(false);
    }
  });

  // Exponential shapes the nested-repeat check lets through: the check must refuse them, not run them for hours.
  it.each(['a{6}(?:a|aa)+$', '(?:a|a|a|a|a|a|a|a)+$', 'a?'.repeat(36) + 'a{36}'])(
    'refuses %s within a second',
    (pattern) => {
      const start = performance.now();
      expect(isSlowPattern(pattern, '')).toBe(true);
      expect(performance.now() - start).toBeLessThan(1000);
    },
  );

  it('reads time from the clock it is given', () => {
    let t = 0;
    // Each probe "takes" 25 ms on this clock, so even a trivial pattern is too slow.
    expect(isSlowPattern('x', '', () => (t += 25))).toBe(true);
  });
});
