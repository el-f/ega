import { describe, it, expect } from 'vitest';
import { hasLongOptionalRun, hasNestedQuantifier } from '@/shared/regex-risk';
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

describe('hasLongOptionalRun', () => {
  it.each([
    'a?'.repeat(13),
    'a?'.repeat(36) + 'a{36}',
    'abcdefghijklmn'
      .split('')
      .map((c) => c + '?')
      .join(''),
    '(?:x|' + '\\w?'.repeat(13) + ')',
    'a{0,1}'.repeat(13),
    'a{0,2}'.repeat(13),
    '(?:a?)'.repeat(13),
    '(?:a?|b?)'.repeat(13),
    // An alternative that can match nothing makes the whole group optional: 24 of these took V8 7 s to compile.
    '(?:a?|b)'.repeat(13),
    String.raw`\p{L}?`.repeat(13),
    String.raw`\u{61}?`.repeat(13),
  ])('refuses %s', (pattern) => {
    expect(hasLongOptionalRun(pattern)).toBe(true);
  });

  it.each([
    'a?'.repeat(12) + 'a{12}',
    'a?x'.repeat(30),
    Array.from({ length: 30 }, (_, i) => `w${i}s?`).join('|'),
    '(?:ab?){200}',
    '[a?b?c?d?e?f?g?h?i?j?k?l?m?n?]+',
    '\\?'.repeat(20),
    'a*'.repeat(30),
    'a{0,}'.repeat(30),
    '(?:ab?)'.repeat(30),
    String.raw`\p{L}+`.repeat(20),
    String.raw`(?<w>a)\k<w>?`.repeat(3),
  ])('keeps %s', (pattern) => {
    expect(hasLongOptionalRun(pattern)).toBe(false);
  });

  it('passes every pattern ega ships', () => {
    for (const p of BUILT_IN_PRESETS) {
      if (p.autoDetect) expect(hasLongOptionalRun(p.autoDetect.regex)).toBe(false);
    }
  });
});
