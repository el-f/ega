import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { safeTest } from '@/shared/safe-regex';

const CATASTROPHIC_REGEXES = [
  { pattern: '(a+)+', flags: '' },
  { pattern: '(.*)*', flags: '' },
  { pattern: '(a|a?)+', flags: '' },
  { pattern: '([a-zA-Z]+)*', flags: '' },
  { pattern: '(a+|b+)+', flags: '' },
  { pattern: '([a-z]+)+$', flags: '' },
  { pattern: '(x+x+)+y', flags: '' },
];

describe('safeTest', () => {
  it('never throws for any regex pattern + any input string', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }),
        fc.string({ maxLength: 200 }),
        fc
          .string({ maxLength: 20 })
          .filter((s) => /^[gimsuy]*$/.test(s) && new Set(s).size === s.length),
        (pattern, input, flags) => {
          expect(() => safeTest(pattern, flags, input)).not.toThrow();
        },
      ),
    );
  });

  it('returns boolean — never undefined/null/throws', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.string({ maxLength: 100 }),
        (pattern, input) => {
          const result = safeTest(pattern, '', input);
          expect(typeof result).toBe('boolean');
        },
      ),
    );
  });

  it('invalid regex pattern returns false (never throws)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (input) => {
        // '[invalid' is always an invalid regex
        const result = safeTest('[invalid', '', input);
        expect(result).toBe(false);
        expect(typeof result).toBe('boolean');
      }),
    );
  });

  it('catastrophic patterns return a boolean without throwing on a short input', () => {
    for (const { pattern, flags } of CATASTROPHIC_REGEXES) {
      const bannedSet = new Set<string>();
      const input = 'aaaaaaaaaaaaaaaaaaaaa!';
      const start = Date.now();

      // Each call uses a fresh bannedSet + custom banThresholdMs
      let threw = false;
      let result: boolean | undefined;
      try {
        result = safeTest(pattern, flags, input, {
          bannedSet,
          banThresholdMs: 50,
          now: () => performance.now(),
        });
      } catch {
        threw = true;
      }

      const elapsed = Date.now() - start;
      expect(threw).toBe(false);
      expect(typeof result).toBe('boolean');
      // 21 chars return in time; hasNestedQuantifier at the entry points is what keeps a long input away from these.
      expect(elapsed).toBeLessThan(2000);
    }
  });

  it('once a slow regex is banned, subsequent calls return false immediately', () => {
    const bannedSet = new Set<string>();
    const pattern = '(a+)+';
    const flags = '';

    // Use a fake clock that always reports "slow" so the first call bans unconditionally
    let callCount = 0;
    const fakeClock = (): number => {
      callCount += 1;
      // Even calls return high value so elapsed = high - low = 100ms > threshold
      return callCount % 2 === 0 ? 200 : 0;
    };

    safeTest(pattern, flags, 'aab', {
      bannedSet,
      banThresholdMs: 50,
      now: fakeClock,
    });

    // Pattern must now be in the bannedSet
    expect(bannedSet.size).toBeGreaterThan(0);

    // Second call must return false without calling the clock (banned-set early exit)
    const clockCallsBefore = callCount;
    const result = safeTest(pattern, flags, 'a'.repeat(100), {
      bannedSet,
      banThresholdMs: 50,
      now: fakeClock,
    });
    expect(result).toBe(false);
    // Clock should not have been called again for banned path
    expect(callCount).toBe(clockCallsBefore);
  });

  it('any valid pattern with empty input returns a boolean without throwing', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 50 }), (pattern) => {
        expect(() => safeTest(pattern, '', '')).not.toThrow();
        const r = safeTest(pattern, '', '');
        expect(typeof r).toBe('boolean');
      }),
    );
  });

  it('input longer than cap is sliced — does not crash or hang', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1025, maxLength: 2000 }), (longInput) => {
        // Use a simple pattern so only the slicing is exercised
        const result = safeTest('a', '', longInput, { inputCap: 1024 });
        expect(typeof result).toBe('boolean');
      }),
    );
  });
});
