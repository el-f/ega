import { describe, expect, it } from 'vitest';
import { omitUndef } from '@/shared/utils/omitUndef';

describe('omitUndef', () => {
  it('drops undefined values', () => {
    expect(omitUndef({ a: 1, b: undefined, c: 'x' })).toEqual({ a: 1, c: 'x' });
  });

  it('keeps null, 0, empty string, false', () => {
    expect(omitUndef({ a: 0, b: '', c: null, d: false })).toEqual({
      a: 0,
      b: '',
      c: null,
      d: false,
    });
  });

  it('is a shallow operation — nested undefined is preserved', () => {
    expect(omitUndef({ a: { b: undefined } })).toEqual({ a: { b: undefined } });
  });

  it('handles empty objects', () => {
    expect(omitUndef({})).toEqual({});
  });

  it('returns a new object — does not mutate input', () => {
    const input = { a: 1, b: undefined };
    const out = omitUndef(input);
    expect(out).not.toBe(input);
    expect('b' in input).toBe(true);
  });
});
