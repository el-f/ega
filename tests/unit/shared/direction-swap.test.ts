import { describe, it, expect } from 'vitest';
import { swapDirection } from '@/shared/site-profile';
import { sel } from '@tests/_helpers/lang';

// swapDirection is its own inverse, allows auto on the target side, and never mutates or aliases.

describe('swapDirection', () => {
  it('swaps a concrete (source, target) pair', () => {
    expect(swapDirection({ source: sel('es'), target: sel('en') })).toEqual({
      source: 'en',
      target: 'es',
    });
  });

  it('swaps language ids too (not just ISO codes)', () => {
    expect(swapDirection({ source: sel('arabizi'), target: sel('en') })).toEqual({
      source: 'en',
      target: 'arabizi',
    });
  });

  it('ALLOWS auto on the target side — reverse-of-auto edge case', () => {
    // The prompt builder renders a target of 'auto' as the source's own language.
    expect(swapDirection({ source: 'auto', target: sel('en') })).toEqual({
      source: 'en',
      target: 'auto',
    });
  });

  it('is its own inverse — swap(swap(d)) === d', () => {
    const pairs = [
      { source: sel('es'), target: sel('en') },
      { source: 'auto', target: sel('fr') },
      { source: sel('arabizi'), target: sel('ja') },
      { source: sel('en'), target: 'auto' },
    ] as const;
    for (const d of pairs) {
      expect(swapDirection(swapDirection(d))).toEqual(d);
    }
  });

  it('does NOT mutate the input object', () => {
    const input = { source: sel('es'), target: sel('en') };
    const frozen = Object.freeze({ ...input });
    // Passing a frozen copy + checking no throw proves the impl reads
    // both fields without trying to write back.
    const out = swapDirection(frozen);
    expect(out).toEqual({ source: 'en', target: 'es' });
    expect(input).toEqual({ source: 'es', target: 'en' });
  });

  it('returns a fresh object (no aliasing with input)', () => {
    const input = { source: sel('es'), target: sel('en') };
    const out = swapDirection(input);
    expect(out).not.toBe(input);
  });
});
