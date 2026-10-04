import type { CustomLanguage, Settings } from '@/shared/types';
import { detectLang } from './detect';
import {
  hasNonEnglishDigitWord,
  looksLikeEnglish,
  looksLikeEnglishAsync,
} from './looks-like-english';
import { DEFAULT_SMART_BUBBLE_MIN_LENGTH } from '@/shared/constants';

interface BubbleCandidate {
  text: string;
}

/** The variety fields stay optional so a caller holding only the bubble knobs still type-checks. */
type BubbleSettings = Pick<Settings, 'bubbleMode' | 'smartBubbleMinLength'> &
  Partial<Pick<Settings, 'disabledVarieties' | 'varietyOverrides'>>;

// Two non-Latin letters, so one "π", "µ" or "Ω" in English is not a foreign script; marks between them keep vocalized Arabic.
const FOREIGN_SCRIPT = /(?!\p{Script=Latin})\p{L}\p{M}*(?!\p{Script=Latin})\p{L}/u;

// Two characters are already a phrase in these scripts ("谢谢", "사랑해요").
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const CJK_MIN_LENGTH = 2;

/** `no-match` is never returned — english / non-english cover the fall-through. */
type BubbleReason =
  | 'mode-never'
  | 'mode-always'
  | 'empty'
  | 'too-short'
  | 'non-ascii'
  | 'detected'
  | 'arabizi-fallback'
  | 'custom-autodetect'
  | 'english'
  | 'non-english'
  | 'no-match';

interface BubbleDecision {
  show: boolean;
  reason: BubbleReason;
}

/** Runs on every `selectionchange` tick — keep it cheap. */
export function shouldShowBubbleWithReason(
  c: BubbleCandidate,
  settings: BubbleSettings,
  customs: CustomLanguage[],
): BubbleDecision {
  const mode = settings.bubbleMode;
  if (mode === 'never') return { show: false, reason: 'mode-never' };

  const trimmed = c.text.trim();
  if (trimmed.length === 0) return { show: false, reason: 'empty' };
  if (mode === 'always') return { show: true, reason: 'mode-always' };

  // smart:
  const minLen = CJK.test(trimmed)
    ? CJK_MIN_LENGTH
    : (settings.smartBubbleMinLength ?? DEFAULT_SMART_BUBBLE_MIN_LENGTH);
  if (trimmed.length < minLen) return { show: false, reason: 'too-short' };
  if (FOREIGN_SCRIPT.test(trimmed)) return { show: true, reason: 'non-ascii' };
  const hit = detectLang(trimmed, { settings, customs });
  if (hit) {
    const isCustom = customs.some((l) => l.id === hit.id);
    return { show: true, reason: isCustom ? 'custom-autodetect' : 'detected' };
  }
  // Arabizi the detector's stricter shape misses ("3ndi", "tari2"); the request still goes out as auto.
  if (hasNonEnglishDigitWord(trimmed)) return { show: true, reason: 'arabizi-fallback' };
  // No variety matched: show the bubble unless the text reads as confidently English.
  if (looksLikeEnglish(trimmed)) {
    return { show: false, reason: 'english' };
  }
  return { show: true, reason: 'non-english' };
}

/** Same decision, but the English branch asks Chrome's LanguageDetector first. */
export async function shouldShowBubbleWithReasonAsync(
  c: BubbleCandidate,
  settings: BubbleSettings,
  customs: CustomLanguage[],
): Promise<BubbleDecision> {
  const sync = shouldShowBubbleWithReason(c, settings, customs);
  if (sync.reason !== 'english' && sync.reason !== 'non-english') return sync;
  const trimmed = c.text.trim();
  const isEnglish = await looksLikeEnglishAsync(trimmed);
  return isEnglish ? { show: false, reason: 'english' } : { show: true, reason: 'non-english' };
}
