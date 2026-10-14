/** LF, CR, NEL, VT, FF, LS, PS — every char that can open a fresh line. */
const LINE_BREAKS = /[\r\n\u0085\v\f\u2028\u2029]+/g;

/** Collapses each run to one space. A prompt block that renders one entry per
 *  line reads a stored line break as the start of a fresh instruction. */
export function toSingleLine(s: string): string {
  return s.replace(LINE_BREAKS, ' ');
}
