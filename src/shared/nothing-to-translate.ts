// A link reads the same in every language, so a model asked to translate one can only echo it.
const LINK = /(?:\b[a-z][\w+.-]*:\/\/|\bwww\.|\bmailto:)\S+|[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/giu;
const LETTER = /\p{L}/u;

/** No letter is left once links and e-mail addresses are taken out: only numbers, symbols or links. */
export function nothingToTranslate(text: string): boolean {
  return !LETTER.test(text.replace(LINK, ' '));
}
