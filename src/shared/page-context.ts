// Missing or malformed input returns undefined or [], never throws.

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

function metaContent(doc: Document, selector: string): string | undefined {
  const el = doc.querySelector(selector);
  const raw = el?.getAttribute('content');
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

/** Page language. Prefers `<html lang="…">`; falls back to `og:locale`. */
export function readPageLang(doc: Document): string | undefined {
  const html = doc.documentElement;
  const attr = html.getAttribute('lang');
  if (typeof attr === 'string') {
    const t = attr.trim();
    if (t) return t;
  }
  return metaContent(doc, 'meta[property="og:locale"]');
}

/** Page description. `<meta name="description">` preferred over `og:description`. */
export function readPageDescription(doc: Document): string | undefined {
  return (
    metaContent(doc, 'meta[name="description"]') ??
    metaContent(doc, 'meta[property="og:description"]')
  );
}

/** Human site name. `og:site_name` preferred over `<meta name="application-name">`. */
export function readSiteName(doc: Document): string | undefined {
  return (
    metaContent(doc, 'meta[property="og:site_name"]') ??
    metaContent(doc, 'meta[name="application-name"]')
  );
}

const HEADING_TAG_SET = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/** The nearest heading labeling each ancestor of `anchor`, outermost first. `textOf` reads a heading's words. */
export function readHeadingTrail(
  anchor: Node,
  maxDepth = 3,
  maxLen = 120,
  textOf: (h: Element) => string = (h) => h.textContent,
): string[] {
  let el: Element | null =
    anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : (anchor.parentElement ?? null);
  const collected: string[] = [];
  const seen = new Set<string>();

  function takeHeadingText(h: Element): string | null {
    const raw = textOf(h).replace(/\s+/g, ' ').trim();
    if (!raw) return null;
    const key = `${h.tagName}:${raw}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return capText(raw, maxLen);
  }

  function isBeforeOrContainsAnchor(h: Element): boolean {
    const rel = h.compareDocumentPosition(anchor);
    const mask = Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY;
    return (rel & mask) !== 0 || h === anchor;
  }

  /** The last heading child (or header/hgroup grandchild) at or before the anchor: the one that labels it. */
  function headingBeforeAnchor(el: Element): Element | null {
    let nearest: Element | null = null;
    for (const child of el.children) {
      // One level only, never the full subtree: a querySelectorAll per ancestor goes quadratic on big DOMs.
      const wraps = child.tagName === 'HEADER' || child.tagName === 'HGROUP';
      for (const h of wraps ? child.children : [child]) {
        if (HEADING_TAG_SET.has(h.tagName) && isBeforeOrContainsAnchor(h)) nearest = h;
      }
    }
    return nearest;
  }

  while (el) {
    const h = headingBeforeAnchor(el);
    if (h) {
      const text = takeHeadingText(h);
      if (text) collected.push(text);
    }
    el = el.parentElement;
  }
  // Walking parentElement gives innermost-first order; reverse it.
  collected.reverse();
  // Slice from the tail: the deepest headings are the ones closest to the selection.
  if (collected.length > maxDepth) {
    return collected.slice(collected.length - maxDepth);
  }
  return collected;
}
