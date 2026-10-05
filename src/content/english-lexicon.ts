import raw from './english-lexicon.txt?raw';

// One sorted word per line, then the ambiguous ones (~). Binary search over the raw text builds no per-word objects.
const COMMON_START = raw.indexOf('\n', raw.lastIndexOf('\n#') + 1) + 1;
const COMMON_END = raw.indexOf('\n~') + 1;
const AMBIGUOUS = new Set(
  raw
    .slice(COMMON_END)
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(1)),
);

function inCommon(w: string): boolean {
  let lo = COMMON_START;
  let hi = COMMON_END;
  while (lo < hi) {
    const start = raw.lastIndexOf('\n', ((lo + hi) >>> 1) - 1) + 1;
    const end = raw.indexOf('\n', start);
    const line = raw.slice(start, end);
    if (line === w) return true;
    if (line < w) lo = end + 1;
    else hi = start;
  }
  return false;
}

// Two-letter words are English only from here (not "be" "an" "am", Arabizi too, or "no"); each word here proves a short phrase.
const FUNCTION_WORDS = new Set(
  'of to in is it on at as by do go he if me my or so up us we ok oh hi our the and for you your more not now all out with this that what from have they'.split(
    ' ',
  ),
);
// Also a particle elsewhere (Hindi "us din", Persian "to man", Vietnamese "cam on"): proof only beside a 4+ letter word.
const WEAK_PROOF = new Set('to do me us in on he hi so is we at go my by'.split(' '));

const WORD = /[\p{L}\d]+(?:['’]\p{L}+)*/gu;
const PROPER_NOUN = /^\p{Lu}\p{Ll}+$/u;
const STARTS_LOWER = /^\p{Ll}/u;
// A letter tripled, an Arabic-sound digraph, or a pronoun ending (-ak "your", -ni "me").
const ARABIZI_SHAPE = /(\p{L})\1\1|kh|gh|dh|\d|(?:ak|ik|ek|kom|kum|ni)$/u;
const MAX_SHORT = 3;
// A short phrase needs a word this long or a FUNCTION_WORDS word: "sale chat", "mare e sole" are English words too.
// A lone common word needs only four letters, and its 's form does not count (Dutch "auto's", "menu's" are not proof).
const PROOF_LENGTH = 5;
const LONG_RATIO = 0.8;

function isCommon(w: string): boolean {
  return inCommon(w) || (w.endsWith("'s") && inCommon(w.slice(0, -2)));
}

/** English only on positive evidence; the digit rule is passed in, as importing it would split looks-like-english into an eager chunk. */
export function readsAsEnglish(text: string, englishDigitWord: RegExp): boolean {
  const words = text.match(WORD) ?? [];
  // A capital mid-sentence is a name; in a title-cased heading every word has one, so it proves nothing.
  const hasLower = words.some((w) => STARTS_LOWER.test(w));
  let english = 0;
  let other = 0;
  let marked = false;
  let proof = false;
  let weakProof = false;
  let hasFourLetterWord = false;
  let bareFour = false;
  let counted = 0;
  for (const [i, word] of words.entries()) {
    const w = word.toLowerCase().replace(/’/g, "'");
    if (englishDigitWord.test(w)) continue;
    counted++;
    if (w.length === 1 || AMBIGUOUS.has(w)) continue;
    const stem = w.endsWith("'s") ? w.slice(0, -2) : w;
    if (FUNCTION_WORDS.has(stem)) {
      english++;
      if (WEAK_PROOF.has(stem)) weakProof = true;
      else proof = true;
    } else if (w.length > 2 && isCommon(w)) {
      english++;
      // Measured without the 's: Dutch plurals "auto's", "menu's" are not proof.
      if (stem.length >= PROOF_LENGTH) proof = true;
      if (stem.length >= 4) hasFourLetterWord = true;
      if (stem === w && w.length >= 4) bareFour = true;
    } else if (i > 0 && hasLower && PROPER_NOUN.test(word)) continue;
    else {
      other++;
      if (ARABIZI_SHAPE.test(w)) marked = true;
    }
  }
  // Nothing but numbers is nothing to translate; nothing but one-letter or ambiguous words is unknown, so show.
  if (counted === 0) return true;
  const scored = english + other;
  if (scored === 0) return false;
  if (scored <= MAX_SHORT)
    return other === 0 && (proof || (weakProof && hasFourLetterWord) || (scored === 1 && bareFour));
  return !marked && english / scored >= LONG_RATIO;
}
