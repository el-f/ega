import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { looksLikeEnglish, looksLikeEnglishAsync } from '@/content/looks-like-english';
import { resetDetectorCache } from '@tests/_helpers/looks-like-english.test-utils';

describe('looksLikeEnglish', () => {
  describe('plain English → true (bubble hides)', () => {
    const cases = [
      'hello world this is a test',
      'I went to the store yesterday',
      'the quick brown fox jumps over',
      'please find attached the document for your review',
      'thank you so much for your help today',
      'what time does the meeting start tomorrow',
    ];
    for (const t of cases) {
      it(`true: ${JSON.stringify(t)}`, () => {
        expect(looksLikeEnglish(t)).toBe(true);
      });
    }
  });

  describe('digit-less Arabizi → false (bubble shows)', () => {
    const cases = [
      'yarayt rase fade add rasak',
      'kif halak ya habibi',
      'shu badak men hal mawdou',
      'ana bhebbak kteer ktir',
      'ma baaref shu sar',
    ];
    for (const t of cases) {
      it(`false: ${JSON.stringify(t)}`, () => {
        expect(looksLikeEnglish(t)).toBe(false);
      });
    }
  });

  describe('edge cases', () => {
    it('empty string → true (nothing to translate, stay hidden)', () => {
      expect(looksLikeEnglish('')).toBe(true);
    });

    // Short selections go through the dictionary too, so short Arabizi like "Min hayde?" is not read as English.
    it('short English selections → true (hide)', () => {
      // Single word that IS in the top-500 dictionary.
      expect(looksLikeEnglish('hello')).toBe(true);
      // Two words, both in top-500.
      expect(looksLikeEnglish('hi there')).toBe(true);
    });

    it('short non-English selections → false (show bubble)', () => {
      // Two Arabizi tokens, neither in the English dictionary.
      expect(looksLikeEnglish('Min hayde')).toBe(false);
      expect(looksLikeEnglish('kif halak')).toBe(false);
      // Single foreign word still shows the bubble.
      expect(looksLikeEnglish('bonjour')).toBe(false);
      expect(looksLikeEnglish('hayde')).toBe(false);
    });

    it('proper nouns in English sentence → true', () => {
      expect(looksLikeEnglish('John Smith said hello today')).toBe(true);
      expect(looksLikeEnglish('we visited Paris last summer')).toBe(true);
    });

    it('numbers and punctuation are ignored for tokenization', () => {
      // "123 the dog ran fast" → tokens: the, dog, ran, fast (all English) → true
      expect(looksLikeEnglish('123 the dog ran fast')).toBe(true);
    });

    it('Elvish-style fantasy text → false', () => {
      expect(looksLikeEnglish('elen sila lumenn omentielvo meldir')).toBe(false);
    });

    it('Gen-Z slang with sparse English base → false', () => {
      // "rizz" and "bussin" and "fr" and "cap" are not in top-500 but
      // "is" and "no" are — ~2/7 tokens → below 0.5 → non-English.
      expect(looksLikeEnglish('this rizz is bussin fr no cap')).toBe(false);
    });
  });
});

describe('looksLikeEnglishAsync', () => {
  const g = globalThis as unknown as { LanguageDetector?: unknown };
  const original = g.LanguageDetector;

  // The detector is cached module-scope (single warm-up per tab in
  // production). Reset between tests so each can install its own mock.
  beforeEach(() => {
    resetDetectorCache();
  });

  afterEach(() => {
    if (original === undefined) delete g.LanguageDetector;
    else g.LanguageDetector = original;
  });

  it('falls back to the dictionary heuristic when LanguageDetector is absent', async () => {
    delete g.LanguageDetector;
    expect(await looksLikeEnglishAsync('yarayt rase fade add rasak')).toBe(false);
    expect(await looksLikeEnglishAsync('hello world this is a test')).toBe(true);
  });

  it('trusts the dictionary over LanguageDetector for digit-less Arabizi', async () => {
    g.LanguageDetector = {
      create: async () => ({
        detect: async () => [{ detectedLanguage: 'en', confidence: 0.95 }],
      }),
    };
    // Chromium's detector says "en" with high confidence on Arabizi; the dictionary overrides it.
    expect(await looksLikeEnglishAsync('yarayt rase fade add rasak')).toBe(false);
  });

  it('lets Chrome override an ambiguous English verdict when it is confidently non-English', async () => {
    g.LanguageDetector = {
      create: async () => ({
        detect: async () => [{ detectedLanguage: 'fr', confidence: 0.9 }],
      }),
    };
    // A string the dictionary narrowly thinks is English but Chrome
    // pegs as French with high confidence → trust Chrome, return false.
    expect(await looksLikeEnglishAsync('today we work on new ideas')).toBe(false);
  });

  it('trusts the dictionary English verdict when Chrome is uncertain', async () => {
    g.LanguageDetector = {
      create: async () => ({
        detect: async () => [{ detectedLanguage: 'fr', confidence: 0.3 }],
      }),
    };
    // Low-confidence Chrome verdict → dictionary wins.
    expect(await looksLikeEnglishAsync('hello world this is a test')).toBe(true);
  });

  it('falls back to dictionary when the API throws', async () => {
    g.LanguageDetector = {
      create: async () => {
        throw new Error('boom');
      },
    };
    expect(await looksLikeEnglishAsync('hello world this is a test')).toBe(true);
    expect(await looksLikeEnglishAsync('yarayt rase fade add rasak')).toBe(false);
  });

  it('retries detector creation after a transient rejection', async () => {
    let createCalls = 0;
    g.LanguageDetector = {
      create: async () => {
        createCalls++;
        if (createCalls === 1) throw new Error('not warmed yet');
        return {
          detect: async () => [{ detectedLanguage: 'fr', confidence: 0.9 }],
        };
      },
    };
    // First call rejects → dictionary fallback wins on the ambiguous case.
    expect(await looksLikeEnglishAsync('today we work on new ideas')).toBe(true);
    expect(createCalls).toBe(1);
    // Yield so the cache-clear .then() fires (it runs after the resolved
    // promise propagates).
    await new Promise((r) => setTimeout(r, 0));
    // Second call retries — detector returns French confidently, flips verdict.
    expect(await looksLikeEnglishAsync('today we work on new ideas')).toBe(false);
    expect(createCalls).toBe(2);
  });
});
