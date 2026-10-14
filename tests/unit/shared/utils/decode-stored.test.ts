import { describe, expect, it } from 'vitest';
import { decodeOrFallback } from '@/shared/utils/decode-stored';

interface Entry {
  ts: number;
  id: string;
}

const isEntryArray = (x: unknown): x is Entry[] =>
  Array.isArray(x) &&
  x.every((e) => e !== null && typeof e === 'object' && typeof (e as Entry).ts === 'number');

describe('decodeOrFallback', () => {
  it('returns raw when predicate passes', () => {
    const raw = [{ ts: 1, id: 'a' }];
    expect(decodeOrFallback(raw, isEntryArray, [])).toBe(raw);
  });

  it('returns fallback on null', () => {
    expect(decodeOrFallback(null, isEntryArray, [])).toEqual([]);
  });

  it('returns fallback on shape mismatch', () => {
    expect(decodeOrFallback([{ ts: 'bad' }], isEntryArray, [])).toEqual([]);
  });

  it('returns fallback when raw is not an array', () => {
    expect(decodeOrFallback({ ts: 1 }, isEntryArray, [])).toEqual([]);
  });

  it('returns fallback when raw is undefined', () => {
    expect(decodeOrFallback(undefined, isEntryArray, [])).toEqual([]);
  });
});
