// A link reads the same in every language, so a model asked to translate one can only echo it.
const LINK = /(?:\b[a-z][\w+.-]*:\/\/|\bwww\.|\bmailto:)\S+|[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/giu;
const LETTER = /\p{L}/u;
// LINK rescans a long run with no "://" from every start position, so its cost grows with the square of the length.
const MAX_CHECKED_CHARS = 2048;

/** No letter is left once links and e-mail addresses are taken out: only numbers, symbols or links. */
export function nothingToTranslate(text: string): boolean {
  if (text.length > MAX_CHECKED_CHARS) return !LETTER.test(text);
  return !LETTER.test(text.replace(LINK, ' '));
}
