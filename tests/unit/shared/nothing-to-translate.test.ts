// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nothingToTranslate } from '@/shared/nothing-to-translate';

describe('nothingToTranslate', () => {
  it.each([
    'https://example.com/a/b?q=hello&lang=fr#top',
    'www.example.org/path',
    '  someone@example.co.uk  ',
    'mailto:someone@example.com',
    'https://a.example, https://b.example',
    '12 345,67',
    '$9.99 (50%)',
    '+1 (555) 010-9999',
    '😀👍',
    '٣٤٥',
  ])('%s has nothing to translate', (text) => {
    expect(nothingToTranslate(text)).toBe(true);
  });

  it.each([
    'hello',
    // One CJK character is a whole word.
    '猫',
    'x',
    'see https://example.com',
    'write to someone@example.com today',
    '1st',
    'Москва',
    'C++',
  ])('%s still goes to the model', (text) => {
    expect(nothingToTranslate(text)).toBe(false);
  });

  it('text with no letter has nothing to translate; a word beside a link still does', () => {
    const text = fc.string({ unit: 'grapheme' });
    fc.assert(
      fc.property(text, (s) => {
        const noLetters = s.replace(/\p{L}/gu, '');
        expect(nothingToTranslate(noLetters)).toBe(true);
        expect(nothingToTranslate(`https://example.com/${s} ${noLetters} word`)).toBe(false);
      }),
    );
  });
});
