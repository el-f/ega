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

/** A translation Ega put on the page, or is putting there; not one a failed try left, nor inline replace's. */
function isLiveMark(m: Element | null): m is Element {
  return (
    m !== null &&
    isEgaMark(m) &&
    !m.hasAttribute('data-ega-original') &&
    m.getAttribute('data-ega-tx-state') !== 'error'
  );
}

/**
 * A block Ega already translated, or is translating: its translation beside it or inside it, or its words in Ega's
 * wrapper. A leading run's mark claims only the run, never the element that holds it.
 */
function isTranslated(el: Element): boolean {
  const next = el.nextElementSibling;
  if (next?.hasAttribute('data-ega-tx') === true && !isRunMark(next) && isLiveMark(next)) {
    return true;
  }
  // A container that merely holds a translated block's sibling box is not itself translated.
  const tag = el.tagName.toUpperCase();
  const block = BLOCK_TAGS.has(tag) || CONTAINER_TAGS.has(tag);
  for (const c of el.children) {
    if (!isLiveMark(c) || isRunMark(c)) continue;
    // Only the box mounted inside this element claims it, not the sibling box of a block inside it.
    if (c.hasAttribute('data-ega-replaced') ? block : c.hasAttribute('data-ega-inside'))
      return true;
  }
  return false;
}

function isRunMark(m: Element): boolean {
  return m.hasAttribute('data-ega-run');
}

const BLOCK_SELECTOR = [...BLOCK_TAGS, ...CONTAINER_TAGS].join(',');

/** A child that is a block, or holds one, ends its parent's leading run. */
function holdsBlock(c: Element): boolean {
  const tag = c.tagName.toUpperCase();
  return BLOCK_TAGS.has(tag) || CONTAINER_TAGS.has(tag) || c.querySelector(BLOCK_SELECTOR) !== null;
}

/**
 * The nodes before an element's first inner block: a comment's first paragraph before its first <p>, a parent list
 * item's own words before its nested list. A whole-page pass translates them as a block of their own.
 */
export function leadingRun(el: Element): ChildNode[] {
  const run: ChildNode[] = [];
  for (const c of el.childNodes) {
    if (c instanceof Element && holdsBlock(c)) break;
    run.push(c);
  }
  return run;
}

/** The run's bare text, also inside the wrapper a failed try of the run left. */
function ownWords(nodes: Iterable<ChildNode>): string {
  let out = '';
  for (const n of nodes) {
    if (n.nodeType === Node.TEXT_NODE) out += n.nodeValue ?? '';
    else if (n instanceof Element && isRunMark(n)) out += ownWords(n.childNodes);
    out += ' ';
  }
  return out;
}

/** Elements the last collection pass took for their leading run only. */
const RUNS = new WeakSet<Element>();

/** True when the last collection pass took this element for its leading run, not its whole text. */
export function isLeadingRun(el: Element): boolean {
  return RUNS.has(el);
}

/** The text of an element's leading run, by the same rules as blockText. */
export function runText(el: Element): string {
  return textOf(leadingRun(el));
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
  const st = a.ownerDocument.defaultView?.getComputedStyle(a);
  o = { x: overflowKind(st?.overflowX), y: overflowKind(st?.overflowY) };
  cache.set(a, o);
  return o;
}

/**
 * A box the user can never scroll to, so the viewport band never reaches it. On each axis, the nearest ancestor
 * that scrolls lets the user reach content past its end, but not before its start. Continue with that scroller's
 * own box: it too must be reachable through its ancestors. Clipping ancestors cut off boxes outside them.
 * At the viewport, hidden/clip overflow uses the screen size, not a scroll range enlarged by the hidden box.
 */
function outOfReach(el: Element, cache: OverflowCache): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const doc = el.ownerDocument;
  const root = doc.documentElement;
  const win = doc.defaultView;
  const rootOverflow = overflowOf(root, cache);
  const bodyAtViewport = rootOverflow.x === 'shows' && rootOverflow.y === 'shows';
  const viewportOverflow = bodyAtViewport ? overflowOf(doc.body, cache) : rootOverflow;
  let { left, right, top, bottom } = r;
  for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
    // With visible root overflow the body's overflow is applied to the viewport instead of its own box.
    if (a === doc.body && bodyAtViewport) continue;
    const o = overflowOf(a, cache);
    if (o.x === 'shows' && o.y === 'shows') continue;
    const ar = a.getBoundingClientRect();
    if (o.x === 'cuts') {
      if (right <= ar.left || left >= ar.right) return true;
      left = Math.max(left, ar.left);
      right = Math.min(right, ar.right);
    } else if (o.x === 'scrolls') {
      const rtl = win?.getComputedStyle(a).direction === 'rtl';
      if (rtl ? left >= ar.right - a.scrollLeft : right <= ar.left - a.scrollLeft) return true;
      left = ar.left;
      right = ar.right;
    }
    if (o.y === 'cuts') {
      if (bottom <= ar.top || top >= ar.bottom) return true;
      top = Math.max(top, ar.top);
      bottom = Math.min(bottom, ar.bottom);
    } else if (o.y === 'scrolls') {
      if (bottom <= ar.top - a.scrollTop) return true;
      top = ar.top;
      bottom = ar.bottom;
    }
  }
  const sx = viewportOverflow.x === 'cuts' ? 0 : (win?.scrollX ?? 0);
  const sy = viewportOverflow.y === 'cuts' ? 0 : (win?.scrollY ?? 0);
  const rtl = win?.getComputedStyle(root).direction === 'rtl';
  const width = viewportOverflow.x === 'cuts' ? root.clientWidth : root.scrollWidth;
  const height = viewportOverflow.y === 'cuts' ? root.clientHeight : root.scrollHeight;
  const minX = rtl && viewportOverflow.x !== 'cuts' ? root.clientWidth - width : 0;
  if (right + sx <= minX || left + sx >= minX + width) return true;
  if (bottom + sy <= 0 || top + sy >= height) return true;
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
  return textOf(el.childNodes);
}

function textOf(nodes: Iterable<ChildNode>): string {
  let out = '';
  const walk = (children: Iterable<ChildNode>): void => {
    for (const c of children) {
      if (c.nodeType === Node.TEXT_NODE) out += (c.nodeValue ?? '').replace(/\s+/g, ' ');
      else if (c instanceof Element) {
        if (c.tagName.toUpperCase() === 'BR') out += '\n';
        else if (!skipSubtree(c)) {
          // A block-level child starts its own line, as innerText does; a React page has no whitespace between tags.
          // Ruby and its reading stay in the line, as they read.
          const display = c.ownerDocument.defaultView?.getComputedStyle(c).display ?? 'inline';
          const own = !/^(?:inline|ruby|contents)/.test(display);
          if (own) out += '\n';
          walk(c.childNodes);
          if (own) out += '\n';
        }
      }
    }
  };
  walk(nodes);
  return out
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * True when Replace text would remove a link, a field, media or a part the page keeps out: from the whole block,
 * or with `run` from its leading run only.
 */
export function keepsPageParts(el: Element, run = false): boolean {
  for (const n of run ? leadingRun(el) : el.childNodes) {
    if (!(n instanceof Element)) continue;
    if (n.matches(PAGE_PARTS) || n.querySelector(PAGE_PARTS) !== null) return true;
    // A component's shadow tree draws text the light DOM does not hold, so moving its host would lose it.
    for (const d of [n, ...n.querySelectorAll('*')])
      if (d.shadowRoot || skipSubtree(d)) return true;
  }
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
    const at = out.length;
    let inner = false;
    for (const child of el.children) if (visit(child)) inner = true;
    if (inner) {
      // The words before the first inner block go first, in page order.
      if (takesRun(el) && out.length < MAX_PAGE_BLOCKS) {
        out.splice(at, 0, el as HTMLElement);
        RUNS.add(el);
      }
      return true;
    }
    const tag = el.tagName.toUpperCase();
    if (!BLOCK_TAGS.has(tag) && !CONTAINER_TAGS.has(tag)) return false;
    const text = blockText(el);
    if (!hasWords(text)) return false;
    if (text.length > opts.maxChars || outOfReach(el, overflow)) return true;
    if (out.length < MAX_PAGE_BLOCKS) {
      out.push(el as HTMLElement);
      RUNS.delete(el);
    }
    return true;
  };
  // ponytail: only the run before the first inner block; words between or after inner blocks stay untranslated.
  const takesRun = (el: Element): boolean => {
    // Words of its own, not only inline children: a menu item's link before its submenu, a skip link, stays out.
    const run = leadingRun(el);
    if (!hasWords(ownWords(run))) return false;
    // In a flex or grid box the run is laid out as items of its own, which a wrapper or a box would change.
    const display = el.ownerDocument.defaultView?.getComputedStyle(el).display ?? '';
    if (/flex|grid/.test(display)) return false;
    for (const c of el.children) if (isRunMark(c) && isLiveMark(c)) return false;
    const text = textOf(run);
    return hasWords(text) && text.length <= opts.maxChars && !outOfReach(el, overflow);
  };
  visit(root);
  return out;
}

/** The order a set of newly near blocks is released in: page order, top to bottom. */
export function releaseOrder(near: readonly number[]): number[] {
  return [...new Set(near)].sort((a, b) => a - b);
}
