import { debugCatch } from '@/shared/logger';
import { ENGLISH_WORDS } from './english-words';
import type * as LexiconMod from './english-lexicon';

const MIN_TOKENS = 1;

// Digit words English uses: "mp3", "win10", "4k", "2nd", "5pm", "25kg", "i18n", plain numbers. Any other digit word is Arabizi-shaped.
const ENGLISH_DIGIT_WORD =
  /^(?:[a-z]*[b-df-hj-np-tv-z]\d+|\d+(?:st|nd|rd|th|am|pm|[kmgxsdp]|kg|km|cm|mm|mb|gb|kb|fps|hz|ms)|[a-z](\d)(?!\1)\d+[a-z]|[a-z]\d[a-z]|\d+)$/;
const ENGLISH_RATIO_THRESHOLD = 0.5;

/** A word with a digit and two letters that is not an English digit word ("3ndi", "tari2"): Arabizi the detector's stricter shape misses. */
export function hasNonEnglishDigitWord(text: string): boolean {
  return (text.toLowerCase().match(/[a-z\d]+/g) ?? []).some(
    (w) => /\d/.test(w) && /[a-z][^a-z]*[a-z]/.test(w) && !ENGLISH_DIGIT_WORD.test(w),
  );
}

// The ~60k-word lexicon is its own chunk, loaded on the first selection that reaches this check; exported for tests.
export const lexiconCacheInternal: {
  mod: typeof LexiconMod | null;
  promise: Promise<typeof LexiconMod | null> | null;
} = { mod: null, promise: null };

export function loadEnglishLexicon(): Promise<typeof LexiconMod | null> {
  lexiconCacheInternal.promise ??= import('./english-lexicon').then(
    (m) => (lexiconCacheInternal.mod = m),
    (e: unknown) => {
      debugCatch(e, 'content.looks-like-english.lexicon');
      lexiconCacheInternal.promise = null;
      return null;
    },
  );
  return lexiconCacheInternal.promise;
}

/** The lexicon decides once loaded; before that, half the tokens on the top-500 list. Empty input is true. */
export function looksLikeEnglish(text: string): boolean {
  const lexicon = lexiconCacheInternal.mod;
  if (lexicon) return lexicon.readsAsEnglish(text, ENGLISH_DIGIT_WORD);
  // An English digit word is neither a hit nor a miss. Accents come off first, so "más" is the one word "mas", not the
  // English "m" and "s".
  const words =
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .match(/[a-z\d]+/g) ?? [];
  const tokens = words.filter((w) => !ENGLISH_DIGIT_WORD.test(w));
  if (tokens.length === 0) return true;
  if (tokens.length < MIN_TOKENS) return true;
  let hits = 0;
  for (const tok of tokens) {
    if (ENGLISH_WORDS.has(tok)) hits++;
  }
  return hits / tokens.length >= ENGLISH_RATIO_THRESHOLD;
}

// Chrome 138+ ships an on-device LanguageDetector that beats the dictionary heuristic on mixed varieties; older browsers have none.
interface LanguageDetectorSample {
  detectedLanguage: string;
  confidence: number;
}
interface LanguageDetectorInstance {
  detect(text: string): Promise<LanguageDetectorSample[]>;
}
type DetectorAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
interface LanguageDetectorFactory {
  availability?(options?: { expectedInputLanguages?: string[] }): Promise<DetectorAvailability>;
  create?(options?: { expectedInputLanguages?: string[] }): Promise<LanguageDetectorInstance>;
}

/** The dictionary decides; LanguageDetector may only overturn an English verdict at >=0.7, since it calls digit-less Arabizi English. */
// create() warms an on-device model, so one detector per tab; the holder is exported only so tests can reset it.
export const detectorCacheInternal: {
  promise: Promise<LanguageDetectorInstance | null> | null;
} = { promise: null };

function getDetector(): Promise<LanguageDetectorInstance | null> {
  if (detectorCacheInternal.promise) return detectorCacheInternal.promise;
  const api = (globalThis as unknown as { LanguageDetector?: LanguageDetectorFactory })
    .LanguageDetector;
  if (!api || typeof api.create !== 'function' || typeof api.availability !== 'function') {
    detectorCacheInternal.promise = Promise.resolve(null);
    return detectorCacheInternal.promise;
  }
  const create = api.create.bind(api);
  const availability = api.availability.bind(api);
  const options = { expectedInputLanguages: ['en'] };
  let retryLater = true;
  const p = (async (): Promise<LanguageDetectorInstance | null> => {
    // create() on a downloadable model starts a download; only a model already on disk is used. Unavailable stays null.
    const state = await availability(options);
    retryLater = state !== 'unavailable';
    if (state !== 'available') return null;
    return create(options);
  })().catch(() => null);
  detectorCacheInternal.promise = p;
  // Drop a null result only while the model may still arrive; the identity check spares a concurrent warm-up.
  void p.then((v) => {
    if (v === null && retryLater && detectorCacheInternal.promise === p) {
      detectorCacheInternal.promise = null;
    }
  });
  return p;
}

// A selection never waits longer than this for the lexicon chunk or the detector; the load keeps going.
const DETECTOR_WAIT_MS = 300;
// The detector is unreliable on a few words, so it gets no say below this length.
const DETECTOR_MIN_CHARS = 20;

function within<T>(p: Promise<T>): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), DETECTOR_WAIT_MS))]);
}

export async function looksLikeEnglishAsync(text: string): Promise<boolean> {
  if (!lexiconCacheInternal.mod) await within(loadEnglishLexicon());
  const dictVerdict = looksLikeEnglish(text);
  if (!dictVerdict || text.length < DETECTOR_MIN_CHARS) return dictVerdict;
  try {
    const detector = await within(getDetector());
    if (!detector) return dictVerdict;
    const results = await within(detector.detect(text));
    const top = results?.[0];
    if (top && top.detectedLanguage !== 'en' && top.confidence >= 0.7) {
      return false;
    }
  } catch (e) {
    debugCatch(e, 'content.looks-like-english.1');
  }
  return dictVerdict;
}
