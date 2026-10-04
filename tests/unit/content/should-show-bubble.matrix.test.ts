import { describe, it, expect } from 'vitest';
import { shouldShowBubbleWithReason } from '@/content/should-show-bubble';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { CustomLanguage } from '@/shared/types';

const smartSettings = { ...DEFAULT_SETTINGS, bubbleMode: 'smart' as const };
const noCustoms: CustomLanguage[] = [];

describe('shouldShowBubble — English vs Arabizi matrix', () => {
  // All ≥ 6 chars, so they pass the length gate and reach the no-match branch.
  const english = [
    'hello world',
    'thank you so much',
    'what are you doing today',
    'this is a test sentence',
    'I had breakfast this morning',
  ];
  for (const text of english) {
    it(`hides on obvious English: ${JSON.stringify(text)}`, () => {
      const { show, reason } = shouldShowBubbleWithReason({ text }, smartSettings, noCustoms);
      expect(show).toBe(false);
      // Permissive — pins the class of decision, not the exact branch.
      expect(reason).toMatch(/no-match|too-short|english/i);
    });
  }

  // Each string carries at least one Arabizi-shaped word.
  const arabizi = [
    '3eyzina w 3adi ya habibi',
    'mar7aba, kifak? shu 3am ta3mel?',
    'e5wet l jiran ma byeltezmo b aya deal',
    'keef 7alak ya 7abibi',
  ];
  for (const text of arabizi) {
    it(`shows on Arabizi: ${JSON.stringify(text)}`, () => {
      const { show, reason } = shouldShowBubbleWithReason({ text }, smartSettings, noCustoms);
      expect(show).toBe(true);
      expect(reason).toMatch(/arabizi|detected|non-ascii/i);
    });
  }

  it('hides on < 6 chars', () => {
    const { show, reason } = shouldShowBubbleWithReason({ text: 'hi' }, smartSettings, noCustoms);
    expect(show).toBe(false);
    expect(reason).toBe('too-short');
  });

  it('shows on non-ASCII (Arabic script)', () => {
    const { show, reason } = shouldShowBubbleWithReason(
      { text: 'مرحبا كيف حالك' },
      smartSettings,
      noCustoms,
    );
    expect(show).toBe(true);
    expect(reason).toBe('non-ascii');
  });

  it('always mode shows even on plain English', () => {
    const { show, reason } = shouldShowBubbleWithReason(
      { text: 'hello world' },
      { ...smartSettings, bubbleMode: 'always' },
      noCustoms,
    );
    expect(show).toBe(true);
    expect(reason).toBe('mode-always');
  });

  it('never mode hides even on Arabizi', () => {
    const { show, reason } = shouldShowBubbleWithReason(
      { text: 'mar7aba, kifak?' },
      { ...smartSettings, bubbleMode: 'never' },
      noCustoms,
    );
    expect(show).toBe(false);
    expect(reason).toBe('mode-never');
  });

  // The sandwich regex needs a letter before the digit, so digit-first words need a second branch.
  it('shows the bubble on "3eyzina, thank you!!"', () => {
    const { show, reason } = shouldShowBubbleWithReason(
      { text: '3eyzina, thank you!!' },
      smartSettings,
      noCustoms,
    );
    expect(show).toBe(true);
    expect(reason).toMatch(/arabizi|detected/i);
  });

  it('shows on digit-leading Arabizi phrase "3eyzina w 7abibi"', () => {
    const { show } = shouldShowBubbleWithReason(
      { text: '3eyzina w 7abibi' },
      smartSettings,
      noCustoms,
    );
    expect(show).toBe(true);
  });

  describe('digit-leading Arabizi fallback does NOT false-positive on English', () => {
    const englishWithDigits = [
      'hello 3D printer model',
      '3x faster performance',
      '5k run this weekend',
      '7am meeting tomorrow',
      'I need 2 items please',
    ];
    for (const text of englishWithDigits) {
      it(`hides on English with digits: ${JSON.stringify(text)}`, () => {
        const { show } = shouldShowBubbleWithReason({ text }, smartSettings, noCustoms);
        expect(show).toBe(false);
      });
    }
  });
});
