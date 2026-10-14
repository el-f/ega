import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { shouldShowBubbleWithReason } from '@/content/should-show-bubble';
import { DEFAULT_SMART_BUBBLE_MIN_LENGTH } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

const smartSettings = {
  bubbleMode: DEFAULT_SETTINGS.bubbleMode as 'smart',
  smartBubbleMinLength: DEFAULT_SETTINGS.smartBubbleMinLength,
};

const noCustoms = [] as const;

const ASCII_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ';

const arbAsciiAlpha = fc
  .array(fc.constantFrom(...ASCII_LETTERS.split('')), { minLength: 6, maxLength: 80 })
  .map((chars) => chars.join(''))
  .filter((s) => s.trim().length >= 6);

const arabiziFallbackWords = ['3aml', '7aga', 'keda2', '2e7na', '5awet'];
const arabiziLeadingWords = ['3eyzina', '7abibi', '5awetek', '3ayza'];

describe('shouldShowBubbleWithReason — property invariants', () => {
  it('pure-ASCII alphabetic strings of sufficient length never trigger arabizi reason', () => {
    fc.assert(
      fc.property(arbAsciiAlpha, (text) => {
        const d = shouldShowBubbleWithReason({ text }, smartSettings, [...noCustoms]);
        expect(d.reason).not.toBe('detected');
        expect(d.reason).not.toBe('arabizi-fallback');
      }),
    );
  });

  it('arabizi words with a digit produce show:true', () => {
    fc.assert(
      fc.property(fc.constantFrom(...arabiziFallbackWords), (word) => {
        const text = word + ' text here so length is fine';
        const d = shouldShowBubbleWithReason({ text }, smartSettings, [...noCustoms]);
        expect(d.show).toBe(true);
      }),
    );
  });

  it('arabizi leading-digit words produce show:true', () => {
    fc.assert(
      fc.property(fc.constantFrom(...arabiziLeadingWords), (word) => {
        const text = word + ' text here so length is fine';
        const d = shouldShowBubbleWithReason({ text }, smartSettings, [...noCustoms]);
        expect(d.show).toBe(true);
      }),
    );
  });

  it('same input always produces the same decision (deterministic)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 200 }), (text) => {
        const d1 = shouldShowBubbleWithReason({ text }, smartSettings, [...noCustoms]);
        const d2 = shouldShowBubbleWithReason({ text }, smartSettings, [...noCustoms]);
        expect(d1.show).toBe(d2.show);
        expect(d1.reason).toBe(d2.reason);
      }),
    );
  });

  it('mode-never returns show:false for any text', () => {
    const neverSettings = { ...smartSettings, bubbleMode: 'never' as const };
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (text) => {
        const d = shouldShowBubbleWithReason({ text }, neverSettings, [...noCustoms]);
        expect(d.show).toBe(false);
        expect(d.reason).toBe('mode-never');
      }),
    );
  });

  it('mode-always returns show:true for any non-empty, non-whitespace text', () => {
    const alwaysSettings = { ...smartSettings, bubbleMode: 'always' as const };
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
        (text) => {
          const d = shouldShowBubbleWithReason({ text }, alwaysSettings, [...noCustoms]);
          expect(d.show).toBe(true);
          expect(d.reason).toBe('mode-always');
        },
      ),
    );
  });

  it('whitespace-only text always returns empty reason in smart mode', () => {
    const WHITESPACE = ' \t\n\r';
    const arbWhitespace = fc
      .array(fc.constantFrom(...WHITESPACE.split('')), { minLength: 1, maxLength: 40 })
      .map((chars) => chars.join(''));
    fc.assert(
      fc.property(arbWhitespace, (text) => {
        const d = shouldShowBubbleWithReason({ text }, smartSettings, [...noCustoms]);
        expect(d.show).toBe(false);
        expect(d.reason).toBe('empty');
      }),
    );
  });

  it('foreign-script text in smart mode always shows (non-ascii reason)', () => {
    const FOREIGN_SCRIPT_CHARS = 'لوあい中文नम';
    const arbForeign = fc
      .array(fc.constantFrom(...FOREIGN_SCRIPT_CHARS.split('')), { minLength: 2, maxLength: 20 })
      .map((chars) => chars.join(''))
      .map((s) => s + ' some padding text')
      .filter((s) => s.trim().length >= 6);
    fc.assert(
      fc.property(arbForeign, (text) => {
        const d = shouldShowBubbleWithReason({ text }, smartSettings, [...noCustoms]);
        expect(d.show).toBe(true);
        expect(d.reason).toBe('non-ascii');
      }),
    );
  });

  it('2-3 non-Latin letters show at every minimum length (the script check runs first)', () => {
    const arbShortForeign = fc
      .array(fc.constantFrom(...'لوあい中文नमשכдя'.split('')), { minLength: 2, maxLength: 3 })
      .map((chars) => chars.join(''));
    fc.assert(
      fc.property(
        arbShortForeign,
        fc.integer({ min: 3, max: 15 }),
        (text, smartBubbleMinLength) => {
          const d = shouldShowBubbleWithReason(
            { text },
            { ...smartSettings, smartBubbleMinLength },
            [...noCustoms],
          );
          expect(d).toEqual({ show: true, reason: 'non-ascii' });
        },
      ),
    );
  });

  it('Latin text with diacritics falls through to the detector, never the non-ascii short-circuit', () => {
    const LATIN_MARKS = 'éàüñçøåß';
    const arbLatinMarks = fc
      .array(fc.constantFrom(...LATIN_MARKS.split('')), { minLength: 1, maxLength: 20 })
      .map((chars) => chars.join(''))
      .map((s) => s + ' some padding text')
      .filter((s) => s.trim().length >= 6);
    fc.assert(
      fc.property(arbLatinMarks, (text) => {
        const d = shouldShowBubbleWithReason({ text }, smartSettings, [...noCustoms]);
        expect(d.reason).not.toBe('non-ascii');
      }),
    );
  });

  it('ASCII-only text shorter than minLength returns too-short', () => {
    const minLen = DEFAULT_SMART_BUBBLE_MIN_LENGTH;
    const arbShort = fc
      .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), {
        minLength: 1,
        maxLength: minLen - 1,
      })
      .map((chars) => chars.join(''))
      .filter((s) => s.trim().length > 0 && s.trim().length < minLen);
    fc.assert(
      fc.property(arbShort, (text) => {
        const d = shouldShowBubbleWithReason({ text }, smartSettings, [...noCustoms]);
        expect(d.show).toBe(false);
        expect(d.reason).toBe('too-short');
      }),
    );
  });
});
