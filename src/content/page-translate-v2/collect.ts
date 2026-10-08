import { isSensitiveTarget } from '../safety';

// ponytail: a cap on the collection pass and its memory on spreadsheet-like pages; a second press continues past it.
export const MAX_PAGE_BLOCKS = 2000;

/** Elements whose text is a unit of reading. */
const BLOCK_TAGS = new Set([
  'P',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'TD',
  'TH',
  'BLOCKQUOTE',
  'FIGCAPTION',
  'CAPTION',
  'DD',
  'DT',
  'SUMMARY',
]);
/** Containers that count as a block when they hold text and no block inside, even if that text sits in inline children. */
const CONTAINER_TAGS = new Set(['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'HEADER', 'FOOTER']);
/** Never translated, and nothing inside them is either. */
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'CODE',
  'PRE',
  'KBD',
  'SAMP',
  'TEXTAREA',
  'INPUT',
  'SELECT',
  'OPTION',
  'BUTTON',
  'SVG',
  'MATH',
  'IFRAME',
  'CANVAS',
  'VIDEO',
  'AUDIO',
]);

/** Replace text would take these off the page, so a block that holds one shows in Show both instead. */
const PAGE_PARTS =
  'a[href], button, input, select, textarea, [contenteditable], [role="textbox"], [role="link"], [role="button"], [tabindex]:not([tabindex="-1"]), label, details, summary, iframe, video, audio, embed, object, canvas, svg, img, picture';

const LETTER = /\p{L}/gu;

/** Ega's own marks: a translation in Show both, or Ega's wrapper over the page's words in Replace text. */
function isEgaMark(el: Element): boolean {
  return el.hasAttribute('data-ega-tx') || el.hasAttribute('data-ega-replaced');
}

/** Nothing inside is read or sent. A mark left by a failed try is not skipped: its words are the page's own. */
function skipSubtree(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName.toUpperCase())) return true;
  if (el.id === 'ega-shadow-host') return true;
  if (isEgaMark(el) && el.getAttribute('data-ega-tx-state') !== 'error') return true;
  if (el.getAttribute('translate') === 'no' || el.classList.contains('notranslate')) return true;
  if ((el as HTMLElement).hidden || el.getAttribute('aria-hidden') === 'true') return true;
  if (isSensitiveTarget(el)) return true;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style?.display === 'none' || style?.visibility === 'hidden') return true;
  // A closed <details> or content-visibility: hidden leaves no box; a display: contents wrapper has none of its own.
  return (
    style?.display !== 'contents' &&
    (el as Partial<Pick<Element, 'checkVisibility'>>).checkVisibility?.() === false
  );
}

/** A block Ega already translated, or is translating: its translation beside it or inside it, or its words in Ega's wrapper. */
function isTranslated(el: Element): boolean {
  const live = (m: Element | null): boolean =>
    m !== null &&
    isEgaMark(m) &&
    !m.hasAttribute('data-ega-original') &&
    m.getAttribute('data-ega-tx-state') !== 'error';
  const next = el.nextElementSibling;
  if (next?.hasAttribute('data-ega-tx') === true && live(next)) return true;
  // A container that merely holds a translated block's sibling box is not itself translated.
  const tag = el.tagName.toUpperCase();
  const block = BLOCK_TAGS.has(tag) || CONTAINER_TAGS.has(tag);
  for (const c of el.children) {
    if (!live(c)) continue;
    // Only the box mounted inside this element claims it, not the sibling box of a block inside it.
    if (c.hasAttribute('data-ega-replaced') ? block : c.hasAttribute('data-ega-inside'))
      return true;
  }
  return false;
}

/** What an ancestor does with a box past its edge on one axis: shows it, cuts it off, or lets the user scroll to it. */
type Overflow = 'shows' | 'cuts' | 'scrolls';
/** Each ancestor's overflow on both axes, cached for one collection pass. */
type OverflowCache = Map<Element, { x: Overflow; y: Overflow }>;

function overflowKind(v: string | undefined): Overflow {
  if (v === 'hidden' || v === 'clip') return 'cuts';
  return v === 'auto' || v === 'scroll' ? 'scrolls' : 'shows';
}

function overflowOf(a: Element, cache: OverflowCache): { x: Overflow; y: Overflow } {
  let o = cache.get(a);
  if (o) return o;
  const doc = a.ownerDocument;
  const win = doc.defaultView;
  const st = win?.getComputedStyle(a);
  o = { x: overflowKind(st?.overflowX), y: overflowKind(st?.overflowY) };
  if (a === doc.body) {
    // With the root's overflow visible, the body's goes to the viewport, whose range the document check covers.
    const rs = win?.getComputedStyle(doc.documentElement);
    if (overflowKind(rs?.overflowX) === 'shows' && overflowKind(rs?.overflowY) === 'shows') {
      o = { x: 'shows', y: 'shows' };
    }
  }
  cache.set(a, o);
  return o;
}

/**
 * A box the user can never scroll to, so the viewport band never reaches it. On each axis, the nearest ancestor
 * that scrolls (an app's main pane, a wide table's wrapper) lets the user reach whatever it holds. Below that, an
 * ancestor that hides its overflow cuts off a box outside it (a carousel's later slides); with no ancestor that
 * scrolls, the box must sit in the document's scroll range (not an off-canvas menu; on a right-to-left page the
 * range runs left of zero).
 */
function outOfReach(el: Element, cache: OverflowCache): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const doc = el.ownerDocument;
  const root = doc.documentElement;
  let scrollsX = false;
  let scrollsY = false;
  for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
    const o = overflowOf(a, cache);
    const cutX = !scrollsX && o.x === 'cuts';
    const cutY = !scrollsY && o.y === 'cuts';
    if (cutX || cutY) {
      const ar = a.getBoundingClientRect();
      if (cutX && (r.right <= ar.left || r.left >= ar.right)) return true;
      if (cutY && (r.bottom <= ar.top || r.top >= ar.bottom)) return true;
    }
    scrollsX ||= o.x === 'scrolls';
    scrollsY ||= o.y === 'scrolls';
    if (scrollsX && scrollsY) return false;
  }
  const win = doc.defaultView;
  if (!scrollsX) {
    const sx = win?.scrollX ?? 0;
    const rtl = win?.getComputedStyle(root).direction === 'rtl';
    const minX = rtl ? root.clientWidth - root.scrollWidth : 0;
    if (r.right + sx <= minX || r.left + sx >= minX + root.scrollWidth) return true;
  }
  if (!scrollsY) {
    const sy = win?.scrollY ?? 0;
    if (r.bottom + sy <= 0 || r.top + sy >= root.scrollHeight) return true;
  }
  return false;
}

/** Fewer than 2 letters (numbers, a lone symbol) is nothing to translate. */
export function hasWords(text: string): boolean {
  return (text.match(LETTER)?.length ?? 0) >= 2;
}

/**
 * The text a block sends: its text nodes outside every skipped part (code, fields, hidden text, text the page
 * keeps out, Ega's own marks), spaces collapsed, a <br> kept as a line break. Never the raw textContent.
 */
export function blockText(el: Element): string {
  let out = '';
  const walk = (node: Element): void => {
    for (const c of node.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) out += (c.nodeValue ?? '').replace(/\s+/g, ' ');
      else if (c instanceof Element) {
        if (c.tagName.toUpperCase() === 'BR') out += '\n';
        else if (!skipSubtree(c)) {
          // A block-level child starts its own line, as innerText does; a React page has no whitespace between tags.
          // Ruby and its reading stay in the line, as they read.
          const display = c.ownerDocument.defaultView?.getComputedStyle(c).display ?? 'inline';
          const own = !/^(?:inline|ruby|contents)/.test(display);
          if (own) out += '\n';
          walk(c);
          if (own) out += '\n';
        }
      }
    }
  };
  walk(el);
  return out
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** True when Replace text would remove a link, a field, media or a part the page keeps out. */
export function keepsPageParts(el: Element): boolean {
  if (el.querySelector(PAGE_PARTS) !== null) return true;
  // A component's shadow tree draws text the light DOM does not hold, so moving its host would lose it.
  for (const d of el.querySelectorAll('*')) if (d.shadowRoot || skipSubtree(d)) return true;
  return false;
}

/**
 * The page's text blocks in document order, innermost first: a list item that holds paragraphs gives the
 * paragraphs. Only element references are kept; the text is read when a block is released.
 */
export function collectBlocks(root: Element, opts: { maxChars: number }): HTMLElement[] {
  const out: HTMLElement[] = [];
  const overflow: OverflowCache = new Map();
  // True when the subtree holds a block (or a block too long to take), so no ancestor claims its text.
  const visit = (el: Element): boolean => {
    if (out.length >= MAX_PAGE_BLOCKS || skipSubtree(el)) return false;
    if (isTranslated(el)) return true;
    let inner = false;
    for (const child of el.children) if (visit(child)) inner = true;
    // ponytail: text that sits next to an inner block (a comment's first line before its <p>) is not collected; a box per text run if that gap matters.
    if (inner) return true;
    const tag = el.tagName.toUpperCase();
    if (!BLOCK_TAGS.has(tag) && !CONTAINER_TAGS.has(tag)) return false;
    const text = blockText(el);
    if (!hasWords(text)) return false;
    if (text.length > opts.maxChars || outOfReach(el, overflow)) return true;
    if (out.length < MAX_PAGE_BLOCKS) out.push(el as HTMLElement);
    return true;
  };
  visit(root);
  return out;
}

/** The order a set of newly near blocks is released in: page order, top to bottom. */
export function releaseOrder(near: readonly number[]): number[] {
  return [...new Set(near)].sort((a, b) => a - b);
}
