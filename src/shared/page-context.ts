// Missing or malformed input returns undefined or [], never throws.

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

/** The nearest heading labeling each ancestor of `anchor`, outermost first. */
export function readHeadingTrail(anchor: Node, maxDepth = 3, maxLen = 120): string[] {
  let el: Element | null =
    anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : (anchor.parentElement ?? null);
  const collected: string[] = [];
  const seen = new Set<string>();

  function takeHeadingText(h: Element): string | null {
    const raw = h.textContent.replace(/\s+/g, ' ').trim();
    if (!raw) return null;
    const key = `${h.tagName}:${raw}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return raw.length > maxLen ? raw.slice(0, maxLen) : raw;
  }

  function headingBeforeAnchor(el: Element): Element | null {
    for (const child of Array.from(el.children)) {
      if (HEADING_TAG_SET.has(child.tagName)) {
        const rel = child.compareDocumentPosition(anchor);
        const isBeforeOrContainsAnchor =
          (rel & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ||
          (rel & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0 ||
          child === anchor;
        if (isBeforeOrContainsAnchor) return child;
      }
      // One level only, never the full subtree: a querySelectorAll per ancestor goes quadratic on big DOMs.
      if (child.tagName === 'HEADER' || child.tagName === 'HGROUP') {
        for (const grand of Array.from(child.children)) {
          if (HEADING_TAG_SET.has(grand.tagName)) {
            const rel = grand.compareDocumentPosition(anchor);
            const isBeforeOrContainsAnchor =
              (rel & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ||
              (rel & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0 ||
              grand === anchor;
            if (isBeforeOrContainsAnchor) return grand;
          }
        }
      }
    }
    return null;
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
