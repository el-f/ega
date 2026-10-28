import { BUILT_IN_PRESETS } from '@/shared/presets';
import { CUSTOM_PATTERN_INPUT_CAP, safeCount } from '@/shared/safe-regex';
import type { CustomLanguage, LangPreset, LangSelection, Settings } from '@/shared/types';
import { ENGLISH_WORDS } from './english-words';

type AutoDetect = NonNullable<LangPreset['autoDetect']>;

export interface DetectOpts {
  /** Only `disabledVarieties` and `varietyOverrides` are read. */
  settings?: Partial<Pick<Settings, 'disabledVarieties' | 'varietyOverrides'>>;
  customs?: readonly CustomLanguage[];
}

const SHIPPED_PATTERNS: ReadonlySet<unknown> = new Set(BUILT_IN_PRESETS.map((p) => p.autoDetect));

/** Counts hits behind the safe-regex ban and input cap — a custom variety carries a user-written regex, so it reads a shorter start. */
function autoDetectHits(text: string, ad: AutoDetect): number {
  if (typeof ad.regex !== 'string') return 0;
  return safeCount(
    ad.regex,
    typeof ad.flags === 'string' ? ad.flags : '',
    text,
    // A shipped pattern is fast on any input, so a slow run is a busy thread, not the pattern.
    SHIPPED_PATTERNS.has(ad)
      ? { banThresholdMs: Infinity }
      : { inputCap: CUSTOM_PATTERN_INPUT_CAP },
  );
}

function matchesAutoDetect(text: string, ad: AutoDetect): boolean {
  const min = typeof ad.minScore === 'number' && ad.minScore > 0 ? ad.minScore : 1;
  return autoDetectHits(text, ad) >= min;
}

/** Enabled varieties in detection order: built-ins carrying the user's override, then customs. */
function candidates(opts: DetectOpts): LangPreset[] {
  const disabled = new Set<string>(opts.settings?.disabledVarieties ?? []);
  const overrides = opts.settings?.varietyOverrides;
  const list: LangPreset[] = [];
  for (const p of BUILT_IN_PRESETS) {
    if (disabled.has(p.id)) continue;
    const ad = overrides?.[p.id]?.autoDetect ?? p.autoDetect;
    list.push(ad ? { ...p, autoDetect: ad } : p);
  }
  for (const c of opts.customs ?? []) {
    if (!disabled.has(c.id)) list.push(c);
  }
  return list;
}

// Versions, units, model names, numeronyms, hex and sizes carry digits too: "win10", "4k", "1st", "A380", "i18n", "0x1F", "1920x1080".
const NOT_LEET = /^(?:[a-z]*\d+|\d+[a-z]{1,2}|[a-z](\d)(?!\1)\d+[a-z]|0x[\da-f]+|\d+x\d+)$/i;

// 0/1/4 are leet. 3/5/7 as a vowel stand-in ("pwn3d") count only beside a 0/1/4 word: "7bibi" and "m3k" are vowel-less Arabizi.
function leetScore(text: string): number {
  let digitHits = 0;
  let vowelHits = 0;
  // A hyphen splits words too: "4-year-old" is a number and two words, not one leet word.
  for (const w of text.split(/[^a-z\d]+/i)) {
    if (/^3?1337$/.test(w)) {
      digitHits++;
      continue;
    }
    if (!/[a-z]/i.test(w) || NOT_LEET.test(w)) continue;
    if (/[014]/.test(w)) digitHits++;
    else if (/(?<![aeiou])[357](?![aeiou])/i.test(w)) vowelHits++;
  }
  return digitHits > 0 ? digitHits + vowelHits : 0;
}

const LETTER = /\p{L}/gu;
const LATIN = /\p{Script=Latin}/u;
const WORD = /[\p{L}\d]+/gu;

const SHIPPED_ARABIZI = BUILT_IN_PRESETS.find((p) => p.id === 'arabizi')?.autoDetect;
// The shipped pattern is fast on any input, so it runs once per word.
const ARABIZI_WORD =
  SHIPPED_ARABIZI && new RegExp(`^(?:${SHIPPED_ARABIZI.regex})$`, SHIPPED_ARABIZI.flags);
// A digit beside a vowel stands for a consonant ("7abibi", "ta3mel"); between consonants it is as often a name ("md5sum").
const DIGIT_BESIDE_VOWEL = /[aeiou][235-9]|[235-9][aeiou]/i;
// A formula or a product code: "CH3COOH", "CO2e".
const TWO_CAPITALS = /\p{Lu}.*\p{Lu}/u;
// Common Arabizi words without a digit; they only outweigh English words. Not "w": English writes "w/" for "with".
const ARABIZI_WORDS: ReadonlySet<string> = new Set(
  'ana enta inta enti inti howa huwa hiya heya ya shu sho shou esh eish wesh eh leh lesh leish ma mesh mish msh mush la bas ktir kteer kter awy awi gedan wayed wayid wa el il al fi fe mn kan kanet kont bel bil fil lal yalla yallah wallah wallahi walla inshallah allah habibi habibti hbibi yani yaani khalas tamam mashi akeed akid tayeb tayyeb bukra bokra bachir lissa lessa halla hala hek heik keda kida keef kif kifak kifik ezayak ezay izzay shlonak shlonik helw kwayes wala lakan lakin aya shi shay wain wen wein fein fen emta imta kam ahla ahlan marhaba salam shukran wach nta nti dak dyal bzaf mzyan labas ghadi da di dah zalame yom youm beit'.split(
    ' ',
  ),
);
// From Arabizi-shaped words alone: Spanish, Italian and French share "la", "ya" and "ma" with Arabizi.
const MIN_SHAPED = 2;

interface WordCount {
  /** Points from Arabizi-shaped words. */
  shaped: number;
  /** Shaped points plus common Arabizi words. */
  arabizi: number;
  english: number;
}

/** An Arabizi-shaped word counts 2 with its digit beside a vowel, else 1; a common Arabizi or English word counts 1. */
function countWords(text: string): WordCount {
  let shaped = 0;
  let common = 0;
  let english = 0;
  for (const word of text.match(WORD) ?? []) {
    const w = word.toLowerCase();
    if (/\d/.test(w)) {
      if (ARABIZI_WORD?.test(w) && !TWO_CAPITALS.test(word))
        shaped += DIGIT_BESIDE_VOWEL.test(w) ? 2 : 1;
    } else if (ARABIZI_WORDS.has(w)) common++;
    else if (ENGLISH_WORDS.has(w)) english++;
  }
  return { shaped, arabizi: shaped + common, english };
}

/** Arabizi and leetspeak are Latin text: a digit word inside Hebrew text ("md5sum", "log4j") is a name. */
function mostlyLatin(text: string): boolean {
  const letters = text.match(LETTER) ?? [];
  return letters.filter((ch) => LATIN.test(ch)).length * 2 >= letters.length;
}

/** An explicit language skips the detector — the user already chose. */
export function resolveSourceLang(
  text: string,
  defaultLang: LangSelection,
  opts: DetectOpts = {},
): LangSelection {
  if (defaultLang === 'auto') return detectLang(text, opts)?.id ?? 'auto';
  return defaultLang;
}

export function detectLang(text: string, opts: DetectOpts = {}): LangPreset | undefined {
  if (text.length < 4) return undefined;
  const list = candidates(opts);
  let counted: WordCount | null | undefined;
  // null: not Latin text, so neither Arabizi nor leetspeak.
  const count = (): WordCount | null => {
    if (counted === undefined) counted = mostlyLatin(text) ? countWords(text) : null;
    return counted;
  };
  // Leetspeak ships no regex of its own, so its digit set is scored here and has to beat Arabizi's own count.
  const leet = list.find((p) => p.id === 'leetspeak');
  if (leet) {
    const leetHits = leetScore(text);
    const arabizi = list.find((p) => p.id === 'arabizi');
    const arabiziHits = arabizi?.autoDetect ? autoDetectHits(text, arabizi.autoDetect) : 0;
    const words = leetHits >= 2 && leetHits >= arabiziHits ? count() : null;
    if (words && leetHits > words.english) return leet;
  }
  for (const p of list) {
    if (!p.autoDetect || !matchesAutoDetect(text, p.autoDetect)) continue;
    // A user's own pattern is trusted as written; the shipped one needs the words around it to agree.
    if (SHIPPED_PATTERNS.has(p.autoDetect)) {
      const words = count();
      if (!words || words.shaped < MIN_SHAPED || words.arabizi <= words.english) continue;
    }
    return p;
  }
  return undefined;
}
