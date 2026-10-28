// Built on first use: the content script imports this on every page.
let graphemes: Intl.Segmenter | undefined;

const segment = (text: string): Intl.Segments =>
  (graphemes ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })).segment(text);

/** The first `max` UTF-16 units or fewer, cut between graphemes, so no emoji, flag or surrogate pair splits. */
export function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 0) return '';
  // The grapheme holding unit `max` is the first one that does not fit.
  let end = segment(text).containing(max)?.index ?? max;
  // One grapheme longer than the cap (a run of combining marks): cut at a code point instead.
  if (end === 0) end = /[\uD800-\uDBFF]/.test(text.charAt(max - 1)) ? max - 1 : max;
  return text.slice(0, end);
}

/** The last `max` UTF-16 units or fewer, cut between graphemes; for text that leads up to a point, like the words before a selection. */
export function capTextFromEnd(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 0) return '';
  const from = text.length - max;
  // The grapheme holding unit `from` fits only when it starts there.
  const at = segment(text).containing(from);
  let start = at === undefined || at.index === from ? from : at.index + at.segment.length;
  if (start === text.length) start = /[\uDC00-\uDFFF]/.test(text.charAt(from)) ? from + 1 : from;
  return text.slice(start);
}
