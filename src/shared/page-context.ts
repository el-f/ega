// Missing or malformed input returns undefined or [], never throws.

import { capText } from './text-cap';

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
