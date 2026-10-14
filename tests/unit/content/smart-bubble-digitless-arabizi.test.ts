import { describe, it, expect } from 'vitest';
import { shouldShowBubbleWithReason } from '@/content/should-show-bubble';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { CustomLanguage } from '@/shared/types';

const smart = { ...DEFAULT_SETTINGS, bubbleMode: 'smart' as const };
const noCustoms: CustomLanguage[] = [];

describe('smart bubble — digit-less Arabizi', () => {
  const mustShow = [
    'yarayt rase fade add rasak',
    'kif halak ya habibi',
    'shu badak men hal mawdou',
    'ana bhebbak kteer ktir',
    'rou7 nem ya zalame', // has digit — sanity check for existing path
    'ma baaref shu sar',
  ];

  for (const text of mustShow) {
    it(`shows on Arabizi phrase: ${JSON.stringify(text)}`, () => {
      const { show } = shouldShowBubbleWithReason({ text }, smart, noCustoms);
      expect(show).toBe(true);
    });
  }

  const mustHide = [
    'hello world this is a test',
    'I went to the store yesterday',
    'the quick brown fox jumps over',
    'please find attached the document',
    'thank you so much for your help',
  ];

  for (const text of mustHide) {
    it(`hides on English phrase: ${JSON.stringify(text)}`, () => {
      const { show } = shouldShowBubbleWithReason({ text }, smart, noCustoms);
      expect(show).toBe(false);
    });
  }

  it('uses the "non-english" reason for digit-less Arabizi', () => {
    const { show, reason } = shouldShowBubbleWithReason(
      { text: 'yarayt rase fade add rasak' },
      smart,
      noCustoms,
    );
    expect(show).toBe(true);
    expect(reason).toBe('non-english');
  });

  it('uses the "english" reason for plain English that falls through', () => {
    const { show, reason } = shouldShowBubbleWithReason(
      { text: 'please find attached the document' },
      smart,
      noCustoms,
    );
    expect(show).toBe(false);
    expect(reason).toBe('english');
  });
});
