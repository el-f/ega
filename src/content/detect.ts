import { BUILT_IN_PRESETS } from '@/shared/presets';
import { safeCount } from '@/shared/safe-regex';
import type { CustomLanguage, LangPreset, LangSelection, Settings } from '@/shared/types';

type AutoDetect = NonNullable<LangPreset['autoDetect']>;

export interface DetectOpts {
  /** Only `disabledVarieties` and `varietyOverrides` are read. */
  settings?: Partial<Pick<Settings, 'disabledVarieties' | 'varietyOverrides'>>;
  customs?: readonly CustomLanguage[];
}

/** Counts hits behind the safe-regex ban and input cap — a custom variety carries a user-written regex. */
function autoDetectHits(text: string, ad: AutoDetect): number {
  if (typeof ad.regex !== 'string') return 0;
  return safeCount(ad.regex, typeof ad.flags === 'string' ? ad.flags : '', text);
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

// Versions, units, model names and numeronyms carry digits too: "win10", "4k", "1st", "A380", "i18n".
const NOT_LEET = /^(?:[a-z]*\d+|\d+[a-z]{1,2}|[a-z](\d)(?!\1)\d+[a-z])$/i;

// 0/1/4 are leet. 3/5/7 as a vowel stand-in ("pwn3d") count only beside a 0/1/4 word: "7bibi" and "m3k" are vowel-less Arabizi.
function leetScore(text: string): number {
  let digitHits = 0;
  let vowelHits = 0;
  for (const raw of text.split(/\s+/)) {
    const w = raw.replace(/^[^a-z\d]+|[^a-z\d]+$/gi, '');
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
  // Leetspeak ships no regex of its own, so its digit set is scored here and has to beat Arabizi's own count.
  const leet = list.find((p) => p.id === 'leetspeak');
  if (leet) {
    const leetHits = leetScore(text);
    const arabizi = list.find((p) => p.id === 'arabizi');
    const arabiziHits = arabizi?.autoDetect ? autoDetectHits(text, arabizi.autoDetect) : 0;
    if (leetHits >= 2 && leetHits >= arabiziHits) return leet;
  }
  for (const p of list) {
    if (p.autoDetect && matchesAutoDetect(text, p.autoDetect)) return p;
  }
  return undefined;
}
