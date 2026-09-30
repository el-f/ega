import { debugCatch } from '@/shared/logger';
import { ENGLISH_WORDS } from './english-words';

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

/** True when enough tokens hit the top-500 English words, at any length (short Arabizi like 'Min hayde?' must not pass). Empty input is true. */
export function looksLikeEnglish(text: string): boolean {
  // An English digit word is neither a hit nor a miss; split at the digit, "mp3" read as the non-word "mp".
  const words = text.toLowerCase().match(/[a-z\d]+/g) ?? [];
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
interface LanguageDetectorFactory {
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
  if (!api || typeof api.create !== 'function') {
    detectorCacheInternal.promise = Promise.resolve(null);
    return detectorCacheInternal.promise;
  }
  const p = api.create({ expectedInputLanguages: ['en'] }).catch(() => null);
  detectorCacheInternal.promise = p;
  // Drop a null result so a not-yet-warmed model does not pin the fallback; the identity check spares a concurrent warm-up.
  void p.then((v) => {
    if (v === null && detectorCacheInternal.promise === p) {
      detectorCacheInternal.promise = null;
    }
  });
  return p;
}

export async function looksLikeEnglishAsync(text: string): Promise<boolean> {
  const dictVerdict = looksLikeEnglish(text);
  if (!dictVerdict) return false; // dictionary is confident it's NOT English
  try {
    const detector = await getDetector();
    if (!detector) return dictVerdict;
    const results = await detector.detect(text);
    const top = results[0];
    if (top && top.detectedLanguage !== 'en' && top.confidence >= 0.7) {
      return false;
    }
  } catch (e) {
    debugCatch(e, 'content.looks-like-english.1');
  }
  return dictVerdict;
}
