import { describe, it, expect, afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import {
  lexiconCacheInternal,
  loadEnglishLexicon,
  looksLikeEnglish,
  looksLikeEnglishAsync,
} from '@/content/looks-like-english';
import { resetDetectorCache } from '@tests/_helpers/looks-like-english.test-utils';

describe('looksLikeEnglish before the lexicon loads (top-500 fallback)', () => {
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

  // R7: an accent split "más" into "m" and "s", two English hits, so a Spanish heading read as English and page
  // translate skipped it as already translated.
  describe('accented words stay whole words → false', () => {
    const cases = ['Libros más vendidos', 'Él está aquí', 'Ça coûte très cher', 'Größe ändern'];
    for (const t of cases) {
      it(`false: ${JSON.stringify(t)}`, () => {
        expect(looksLikeEnglish(t)).toBe(false);
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

describe('looksLikeEnglish with the lexicon loaded', () => {
  beforeAll(async () => {
    await loadEnglishLexicon();
  });
  afterAll(() => {
    lexiconCacheInternal.mod = null;
    lexiconCacheInternal.promise = null;
  });

  it.each(['Recently', 'HOMEMADE BURGERS', 'Opening hours', "Today's specials", "Don't miss it"])(
    'English: %s',
    (t) => {
      expect(looksLikeEnglish(t)).toBe(true);
    },
  );

  it.each(['kif halak', 'ana bas', 'ya ana', 'men fadlak', 'bonjour', 'law samaht'])(
    'not English: %s',
    (t) => {
      expect(looksLikeEnglish(t)).toBe(false);
    },
  );

  it('reads words that are both English and Arabizi as neither', () => {
    // "add", "bad", "men" alone prove nothing, so a text of only those shows the bubble.
    expect(looksLikeEnglish('add bad men')).toBe(false);
    expect(looksLikeEnglish('Add to cart')).toBe(true);
  });

  it('treats numbers alone as nothing to translate', () => {
    expect(looksLikeEnglish('12345')).toBe(true);
    expect(looksLikeEnglish('')).toBe(true);
  });

  it('skips a capitalized name inside a sentence, not in a title-cased heading', () => {
    expect(looksLikeEnglish('we visited Paris last summer')).toBe(true);
    expect(looksLikeEnglish('Visit Paris')).toBe(false);
  });

  it('needs 80% of a longer text, and no Arabizi-shaped word', () => {
    expect(looksLikeEnglish('please find attached the document for your review')).toBe(true);
    // Four of five counted words are English, but "habibiii" is elongated.
    expect(looksLikeEnglish('thank you so much for everything habibiii')).toBe(false);
    expect(looksLikeEnglish('this rizz is bussin fr no cap')).toBe(false);
  });
});

describe('looksLikeEnglishAsync', () => {
  const g = globalThis as unknown as { LanguageDetector?: unknown };
  const original = g.LanguageDetector;
  const available = async (): Promise<string> => 'available';

  // One detector per tab in production; each test installs its own mock.
  beforeEach(() => {
    resetDetectorCache();
  });

  afterEach(() => {
    if (original === undefined) delete g.LanguageDetector;
    else g.LanguageDetector = original;
  });

  it('loads the lexicon on the first call', async () => {
    lexiconCacheInternal.mod = null;
    lexiconCacheInternal.promise = null;
    delete g.LanguageDetector;
    expect(looksLikeEnglish('Recently')).toBe(false);
    expect(await looksLikeEnglishAsync('Recently')).toBe(true);
    expect(looksLikeEnglish('Recently')).toBe(true);
  });

  it('falls back to the dictionary heuristic when LanguageDetector is absent', async () => {
    delete g.LanguageDetector;
    expect(await looksLikeEnglishAsync('yarayt rase fade add rasak')).toBe(false);
    expect(await looksLikeEnglishAsync('hello world this is a test')).toBe(true);
  });

  it('trusts the dictionary over LanguageDetector for digit-less Arabizi', async () => {
    g.LanguageDetector = {
      availability: available,
      create: async () => ({
        detect: async () => [{ detectedLanguage: 'en', confidence: 0.95 }],
      }),
    };
    // Chromium's detector says "en" with high confidence on Arabizi; the dictionary overrides it.
    expect(await looksLikeEnglishAsync('yarayt rase fade add rasak')).toBe(false);
  });

  it('lets Chrome override an English verdict when it is confidently non-English', async () => {
    g.LanguageDetector = {
      availability: available,
      create: async () => ({
        detect: async () => [{ detectedLanguage: 'fr', confidence: 0.9 }],
      }),
    };
    expect(await looksLikeEnglishAsync('today we work on new ideas')).toBe(false);
  });

  it('gives the detector no say under 20 characters', async () => {
    const detect = vi.fn(async () => [{ detectedLanguage: 'fr', confidence: 0.99 }]);
    g.LanguageDetector = { availability: available, create: async () => ({ detect }) };
    expect(await looksLikeEnglishAsync('Opening hours')).toBe(true);
    expect(detect).not.toHaveBeenCalled();
    expect(await looksLikeEnglishAsync('today we work on new ideas')).toBe(false);
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it('trusts the dictionary English verdict when Chrome is uncertain', async () => {
    g.LanguageDetector = {
      availability: available,
      create: async () => ({
        detect: async () => [{ detectedLanguage: 'fr', confidence: 0.3 }],
      }),
    };
    expect(await looksLikeEnglishAsync('hello world this is a test')).toBe(true);
  });

  it('falls back to dictionary when the API throws', async () => {
    g.LanguageDetector = {
      availability: available,
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
      availability: available,
      create: async () => {
        createCalls++;
        if (createCalls === 1) throw new Error('not warmed yet');
        return {
          detect: async () => [{ detectedLanguage: 'fr', confidence: 0.9 }],
        };
      },
    };
    expect(await looksLikeEnglishAsync('today we work on new ideas')).toBe(true);
    expect(createCalls).toBe(1);
    // Yield so the cache-clear .then() fires.
    await new Promise((r) => setTimeout(r, 0));
    expect(await looksLikeEnglishAsync('today we work on new ideas')).toBe(false);
    expect(createCalls).toBe(2);
  });

  it('never uses a detector whose API has no availability()', async () => {
    const create = vi.fn();
    g.LanguageDetector = { create };
    expect(await looksLikeEnglishAsync('today we work on new ideas')).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it('never calls create() when availability() says unavailable, and asks once per tab', async () => {
    let checks = 0;
    const create = vi.fn();
    g.LanguageDetector = {
      availability: async () => {
        checks++;
        return 'unavailable';
      },
      create,
    };
    expect(await looksLikeEnglishAsync('hello world this is a test')).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(await looksLikeEnglishAsync('hello world this is a test')).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(checks).toBe(1);
  });

  it.each(['downloadable', 'downloading'])(
    'never calls create() while %s, then uses the model once it is available',
    async (pending) => {
      let state = pending;
      const create = vi.fn(async () => ({
        detect: async () => [{ detectedLanguage: 'fr', confidence: 0.9 }],
      }));
      g.LanguageDetector = { availability: async () => state, create };
      expect(await looksLikeEnglishAsync('today we work on new ideas')).toBe(true);
      await new Promise((r) => setTimeout(r, 0));
      expect(create).not.toHaveBeenCalled();
      state = 'available';
      expect(await looksLikeEnglishAsync('today we work on new ideas')).toBe(false);
      expect(create).toHaveBeenCalledTimes(1);
    },
  );

  it('answers from the dictionary when detect() never answers', async () => {
    await loadEnglishLexicon();
    vi.useFakeTimers();
    try {
      g.LanguageDetector = {
        availability: available,
        create: async () => ({ detect: () => new Promise(() => {}) }),
      };
      const verdict = looksLikeEnglishAsync('hello world this is a test');
      await vi.advanceTimersByTimeAsync(1000);
      expect(await verdict).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
