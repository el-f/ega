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

/** Show both puts the translation inside these (D46), so a box inside one marks it translated. */
const INSIDE_TX = new Set(['TD', 'TH', 'LI', 'DD', 'DT']);

/** Replace text would take these off the page, so a block that holds one shows in Show both instead (D45). */
const PAGE_PARTS =
  'a[href], button, input, select, textarea, [contenteditable], [role="textbox"], iframe, video, audio, embed, object, canvas, svg, img, picture';

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
    if (c.hasAttribute('data-ega-replaced') ? block : INSIDE_TX.has(tag)) return true;
  }
  return false;
}

/** Moved off the left edge (an off-canvas menu): the viewport band only reaches up and down, so it never comes near. */
function offLeft(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.right <= 0;
}

/** Fewer than 2 letters (numbers, a lone symbol) is nothing to translate. */
export function hasWords(text: string): boolean {
  return (text.match(LETTER)?.length ?? 0) >= 2;
}

/**
 * The text a block sends (D48): its text nodes outside every skipped part (code, fields, hidden text, text the page
 * keeps out, Ega's own marks), spaces collapsed, a <br> kept as a line break. Never the raw textContent.
 */
export function blockText(el: Element): string {
  let out = '';
  const walk = (node: Element): void => {
    for (const c of node.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) out += (c.nodeValue ?? '').replace(/\s+/g, ' ');
      else if (c instanceof Element) {
        if (c.tagName.toUpperCase() === 'BR') out += '\n';
        else if (!skipSubtree(c)) walk(c);
      }
    }
  };
  walk(el);
  return out
    .replace(/ *\n */g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** True when Replace text would remove a link, a field, media or a part the page keeps out (D45). */
export function keepsPageParts(el: Element): boolean {
  if (el.querySelector(PAGE_PARTS) !== null) return true;
  for (const d of el.querySelectorAll('*')) if (skipSubtree(d)) return true;
  return false;
}

/**
 * The page's text blocks in document order, innermost first: a list item that holds paragraphs gives the
 * paragraphs. Only element references are kept; the text is read when a block is released.
 */
export function collectBlocks(root: Element, opts: { maxChars: number }): HTMLElement[] {
  const out: HTMLElement[] = [];
  // True when the subtree holds a block (or a block too long to take), so no ancestor claims its text.
  const visit = (el: Element): boolean => {
    if (out.length >= MAX_PAGE_BLOCKS || skipSubtree(el)) return false;
    if (isTranslated(el)) return true;
    let inner = false;
    for (const child of el.children) if (visit(child)) inner = true;
    if (inner) return true;
    const tag = el.tagName.toUpperCase();
    if (!BLOCK_TAGS.has(tag) && !CONTAINER_TAGS.has(tag)) return false;
    const text = blockText(el);
    if (!hasWords(text)) return false;
    if (text.length > opts.maxChars || offLeft(el)) return true;
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
