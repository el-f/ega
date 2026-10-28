// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { detectLang } from '@/content/detect';
import { shouldShowBubbleWithReason } from '@/content/should-show-bubble';
import { looksLikeEnglish } from '@/content/looks-like-english';
import { safeCount } from '@/shared/safe-regex';
import { preset } from '@tests/_helpers/lang';
import type { CustomLanguage } from '@/shared/types';

const smart = { bubbleMode: 'smart' as const, smartBubbleMinLength: 6 };
const bubble = (text: string) => shouldShowBubbleWithReason({ text }, smart, []);

describe('the script check runs before the length gate', () => {
  it('shows a two-letter Hebrew word even at a minimum of 6', () => {
    expect(bubble('כן')).toEqual({ show: true, reason: 'non-ascii' });
  });
});

// The labeled lines live in tests/fixtures/detect-corpus.ts (detect-corpus.test.ts); these check the bubble too.
describe('a mostly English line with one Arabizi word', () => {
  it('goes out as auto, and the bubble still shows', () => {
    expect(detectLang('I love you 7abibi')?.id).toBeUndefined();
    expect(bubble('I love you 7abibi')).toEqual({ show: true, reason: 'arabizi-fallback' });
  });
});

// 7 and 3 between consonants are vowel-less Arabizi as often as leet.
describe('vowel-less Arabizi is not leetspeak', () => {
  it.each(['7bibi 3mri', 'm3k 7mdlh', 'w7shtni ya 7bibi'])('%s', (text) => {
    expect(detectLang(text)?.id).not.toBe('leetspeak');
    expect(bubble(text).show).toBe(true);
  });
});

// An empty branch matches at every position.
describe('a custom pattern that can match empty text', () => {
  const custom: CustomLanguage = {
    id: preset('0c9d1b2a-3e4f-4a5b-8c6d-7e8f90a1b2c3'),
    label: 'Klingon',
    hint: 'test',
    examples: [],
    autoDetect: { regex: '\\b(nuqneH|Qapla|)\\b', flags: 'i', minScore: 2 },
    createdAt: 0,
  };

  it('does not claim plain English', () => {
    expect(detectLang('Hello, how are you today?', { customs: [custom] })).toBeUndefined();
  });

  it('still counts its real words', () => {
    expect(detectLang('nuqneH and Qapla friends', { customs: [custom] })?.id).toBe(custom.id);
  });

  it('safeCount skips empty matches', () => {
    expect(safeCount('(x)?', '', 'abc')).toBe(0);
    expect(safeCount('b', '', 'abcb')).toBe(2);
  });
});

describe('smart bubble', () => {
  // One symbol letter is not a foreign script.
  it.each([
    'The value of π is about 3.14',
    'The cell is 5 µm wide and thin',
    'Use a 10 kΩ resistor in the circuit',
  ])('stays hidden on English with one symbol letter: %s', (text) => {
    expect(bubble(text).show).toBe(false);
  });

  it.each(['مَرْحَبًا بِكُمْ', 'שָׁלוֹם עֲלֵיכֶם', 'Tokyo (東京) is big'])(
    'shows on a foreign script: %s',
    (text) => {
      expect(bubble(text)).toEqual({ show: true, reason: 'non-ascii' });
    },
  );

  // Two characters are a phrase in Chinese, Japanese and Korean.
  it.each(['谢谢你', 'こんにちは', '사랑해요'])('shows on a short CJK phrase: %s', (text) => {
    expect(bubble(text).show).toBe(true);
  });

  // Vowel-less and trailing-digit Arabizi words do not match the detector, but they are not English words either.
  it.each(['3ndk time bukra?', 'ok 3ndi a meeting', 'that was 3njad so good', 'I am 3al tari2'])(
    'shows on code-switched Arabizi: %s',
    (text) => {
      expect(bubble(text).show).toBe(true);
    },
  );

  it('hides on English that only mentions an mp3', () => {
    expect(looksLikeEnglish('Download the mp3 files here')).toBe(true);
  });
});
