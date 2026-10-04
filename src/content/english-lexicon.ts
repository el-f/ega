import raw from './english-lexicon.txt?raw';

const COMMON = new Set<string>();
const AMBIGUOUS = new Set<string>();
for (const line of raw.split(/\r?\n/)) {
  if (line === '' || line.startsWith('#')) continue;
  if (line.startsWith('~')) AMBIGUOUS.add(line.slice(1));
  else COMMON.add(line);
}

const WORD = /[\p{L}\d]+(?:['’]\p{L}+)*/gu;
const PROPER_NOUN = /^\p{Lu}\p{Ll}+$/u;
const STARTS_LOWER = /^\p{Ll}/u;
// A letter tripled, an Arabic-sound digraph, or a pronoun ending (-ak "your", -ni "me").
const ARABIZI_SHAPE = /(\p{L})\1\1|kh|gh|dh|\d|(?:ak|ik|ek|kom|kum|ni)$/u;
const MAX_SHORT = 3;
const LONG_RATIO = 0.8;

function isCommon(w: string): boolean {
  return COMMON.has(w) || (w.endsWith("'s") && COMMON.has(w.slice(0, -2)));
}

/** English only on positive evidence; the digit rule is passed in, as importing it would split looks-like-english into an eager chunk. */
export function readsAsEnglish(text: string, englishDigitWord: RegExp): boolean {
  const words = text.match(WORD) ?? [];
  // A capital mid-sentence is a name; in a title-cased heading every word has one, so it proves nothing.
  const hasLower = words.some((w) => STARTS_LOWER.test(w));
  let english = 0;
  let other = 0;
  let marked = false;
  let counted = 0;
  for (const [i, word] of words.entries()) {
    const w = word.toLowerCase().replace(/’/g, "'");
    if (englishDigitWord.test(w)) continue;
    counted++;
    if (w.length <= 2 || AMBIGUOUS.has(w)) continue;
    if (isCommon(w)) english++;
    else if (i > 0 && hasLower && PROPER_NOUN.test(word)) continue;
    else {
      other++;
      if (ARABIZI_SHAPE.test(w)) marked = true;
    }
  }
  // Nothing but numbers is nothing to translate; nothing but short or ambiguous words is unknown, so show.
  if (counted === 0) return true;
  const scored = english + other;
  if (scored === 0) return false;
  if (scored <= MAX_SHORT) return other === 0;
  return !marked && english / scored >= LONG_RATIO;
}
