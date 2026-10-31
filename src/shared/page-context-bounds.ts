// Its own module: the content script never reads a message-borne context, so this stays out of its bundle.
import { MAX_SELECTION_CHARS } from './constants';
import { capText } from './text-cap';
import type { PageContext } from './types';

const STRING_FIELDS = [
  'pageTitle',
  'pageUrl',
  'pageLang',
  'pageDescription',
  'siteName',
  'beforeText',
  'afterText',
  'postText',
  'imageAlt',
  'imageCaption',
] as const satisfies readonly (keyof PageContext)[];
// A new PageContext field missing above makes this non-`never`, so the assignment below fails to compile.
type _AllFieldsBounded =
  Exclude<keyof PageContext, (typeof STRING_FIELDS)[number] | 'headingTrail'> extends never
    ? true
    : never;
const _allFieldsBounded: _AllFieldsBounded = true;
void _allFieldsBounded;

// Matches the schema max of `headingTrailDepth`.
const MAX_HEADING_TRAIL_ENTRIES = 10;

/** Trust boundary for page context read from a message or storage: only string fields and a string trail, each cut
 *  to the selection cap, so a forged one cannot carry a non-string or unbounded text into the redaction and the prompt. */
export function boundPageContext(raw: unknown): PageContext | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const cap = (v: string): string => capText(v, MAX_SELECTION_CHARS);
  const out: PageContext = {};
  for (const k of STRING_FIELDS) {
    const v = r[k];
    if (typeof v === 'string') out[k] = cap(v);
  }
  const trail = r['headingTrail'];
  if (Array.isArray(trail)) {
    out.headingTrail = trail
      .filter((h): h is string => typeof h === 'string')
      .slice(0, MAX_HEADING_TRAIL_ENTRIES)
      .map(cap);
  }
  return out;
}
