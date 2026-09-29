import { describe, it, expect } from 'vitest';
import { hasNestedQuantifier } from '@/shared/safe-regex';
import { BUILT_IN_PRESETS } from '@/shared/presets';

const ARABIZI_PATTERN = '\\b(?=\\w*[23578])(?=\\w*[A-Za-z]\\w*[A-Za-z])\\w+\\b';

describe('hasNestedQuantifier', () => {
  it.each([
    '(a+)+$',
    '(.*)*',
    '(a|a?)+',
    '([a-zA-Z]+)*',
    '(a+|b+)+',
    '([a-z]+)+$',
    '(x+x+)+y',
    '(?:\\w+\\s?)+$',
    '((ab)+c)*',
    '((a+))+',
    '(a+){2}',
    '(a+)+?',
    // An unbounded repeat over an alternation with a wide atom, and one atom repeated twice in a row.
    '(\\w|\\d)+$',
    '(.|x)+',
    '([a-z]|_)+',
    '\\w*\\w*\\w*!',
    '.*.+x',
  ])('rejects %s', (pattern) => {
    expect(hasNestedQuantifier(pattern)).toBe(true);
  });

  it.each([
    ARABIZI_PATTERN,
    '[+*]+',
    '\\++',
    '(ab)+',
    '(a|b)+',
    '(?:yalla|wallah)+',
    '(a|b)?',
    '(a|b){2}',
    '(a+)b+',
    '(a+)?',
    '(?=a+)b',
    '(?<w>a+)\\k<w>',
    'a{2,}b{3}',
    '[(]a+[)]+',
    '\\(a+\\)+',
    'a{',
    '(a+',
  ])('accepts %s', (pattern) => {
    expect(hasNestedQuantifier(pattern)).toBe(false);
  });

  it('accepts every shipped detection pattern', () => {
    const shipped = BUILT_IN_PRESETS.filter((p) => p.autoDetect);
    expect(shipped.length).toBeGreaterThan(0);
    for (const p of shipped) {
      expect(hasNestedQuantifier(p.autoDetect?.regex ?? ''), p.id).toBe(false);
    }
  });
});
