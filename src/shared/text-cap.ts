const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** The first `max` UTF-16 units or fewer, cut between graphemes, so no emoji, flag or surrogate pair splits. */
export function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = 0;
  for (const { index, segment } of graphemes.segment(text)) {
    if (index + segment.length > max) break;
    end = index + segment.length;
  }
  // One grapheme longer than the cap (a run of combining marks): cut at a code point instead.
  if (end === 0) end = /[\uD800-\uDBFF]/.test(text.charAt(max - 1)) ? max - 1 : max;
  return text.slice(0, end);
}
