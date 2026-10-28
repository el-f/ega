import { describe, it, expect } from 'vitest';
import { expandSnippets, resolveSnippets, MAX_DEPTH, EXPANDED_MAX } from '@/shared/snippets';

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

  it('writes out a prompt past 16k chars in full while it stays under the cap', () => {
    const big = 'x'.repeat(8000);
    expect(expandSnippets('@@big@@ @@big@@ @@big@@', { big })).toBe(`${big} ${big} ${big}`);
  });

  it('stops expanding once the text passes the cap, so nested refs cannot explode', () => {
    // 3200 refs to a body of 1638 refs: written out in full this is ~26M chars.
    const snippets = { a: '@@b@@'.repeat(1638), b: 'yyyyy' };
    const input = '@@a@@'.repeat(3200);
    const out = expandSnippets(input, snippets);
    expect(out.length).toBeGreaterThan(EXPANDED_MAX);
    // At most one body past the cap, plus the input tail whose refs stay literal.
    expect(out.length).toBeLessThanOrEqual(EXPANDED_MAX + 8192 + input.length);
  });

  it('a third nesting level stays bounded too', () => {
    const snippets = { a: '@@b@@'.repeat(1638), b: '@@c@@'.repeat(1638), c: 'zzzzz' };
    const input = '@@a@@'.repeat(3200);
    expect(resolveSnippets(input, snippets).length).toBeLessThanOrEqual(
      EXPANDED_MAX + 8192 + input.length,
    );
  });
});
