import { describe, it, expect } from 'vitest';
import { errCodeLabel } from '@/shared/err-labels';
import type { ErrCode } from '@/shared/types';

describe('errCodeLabel', () => {
  // satisfies Record<ErrCode, true> makes a missing or extra code fail typecheck.
  const ALL_CODES = Object.keys({
    NETWORK: true,
    SERVER: true,
    AUTH: true,
    RATE_LIMIT: true,
    QUOTA: true,
    REQUEST: true,
    NATIVE_NOT_INSTALLED: true,
    NATIVE_SPAWN_FAIL: true,
    ABORTED: true,
    TIMEOUT: true,
    PARSE: true,
    PROTOCOL: true,
    UNSUPPORTED: true,
    IMAGE_UNSUPPORTED: true,
    NO_BACKEND: true,
    UNKNOWN: true,
  } satisfies Record<ErrCode, true>) as ErrCode[];

  for (const code of ALL_CODES) {
    it(`returns a non-empty human label for ${code}`, () => {
      const label = errCodeLabel(code);
      expect(label).toBeTypeOf('string');
      expect(label.length).toBeGreaterThan(0);
      // The raw code must not leak through.
      expect(label).not.toBe(code);
    });
  }

  it('avoids HTTP/dev wording on the labels a non-technical reader hits', () => {
    expect(errCodeLabel('REQUEST')).toBe('Request rejected');
    expect(errCodeLabel('QUOTA')).toBe('Out of credit');
    expect(errCodeLabel('SERVER')).toBe('Backend error');
  });

  it('PARSE and PROTOCOL read differently — they offer opposite affordances', () => {
    expect(errCodeLabel('PARSE')).toBe('Could not read the reply');
    expect(errCodeLabel('PROTOCOL')).toBe('Reply was cut short');
    expect(errCodeLabel('PARSE')).not.toBe(errCodeLabel('PROTOCOL'));
  });

  it('gives every code a label no other code shares', () => {
    const labels = ALL_CODES.map((c) => errCodeLabel(c));
    expect(new Set(labels).size).toBe(ALL_CODES.length);
  });

  it('labels the no-backend case as a setup problem, not "Unsupported"', () => {
    expect(errCodeLabel('NO_BACKEND')).toBe('Setup needed');
  });

  it('throws on an off-union value at runtime (assertNever guard)', () => {
    // An unnormalized code (for example from the native host) must throw, not render garbage.
    expect(() => errCodeLabel('BOGUS' as ErrCode)).toThrow();
  });
});
