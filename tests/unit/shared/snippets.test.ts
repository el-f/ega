import { describe, it, expect } from 'vitest';
import { resolveSnippets, MAX_DEPTH } from '@/shared/snippets';

describe('resolveSnippets', () => {
  it('returns text unchanged when no snippet refs', () => {
    expect(resolveSnippets('plain text', {})).toBe('plain text');
  });

  it('expands single-level @@name@@', () => {
    expect(resolveSnippets('hello @@persona@@', { persona: 'world' })).toBe('hello world');
  });

  it('expands nested snippets recursively', () => {
    expect(resolveSnippets('@@a@@', { a: 'A→@@b@@', b: 'B→@@c@@', c: 'C' })).toBe('A→B→C');
  });

  it('caps recursion at MAX_DEPTH and returns last-resolved text', () => {
    const cyclic = { a: '@@a@@' };
    const out = resolveSnippets('@@a@@', cyclic);
    // After MAX_DEPTH expansions, leaves the unresolved ref in place.
    expect(out).toBe('@@a@@');
  });

  it('respects escape \\@@ to prevent expansion', () => {
    expect(resolveSnippets('literal \\@@persona\\@@', { persona: 'X' })).toBe(
      'literal @@persona@@',
    );
  });

  it('leaves unknown @@name@@ unchanged', () => {
    expect(resolveSnippets('@@missing@@', {})).toBe('@@missing@@');
  });

  it('MAX_DEPTH is exactly 3', () => {
    expect(MAX_DEPTH).toBe(3);
  });
});
