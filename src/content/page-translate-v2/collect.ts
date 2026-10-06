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
/** Containers that count as a block when they hold text of their own and no block inside. */
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

const LETTER = /\p{L}/gu;

function skipSubtree(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName.toUpperCase())) return true;
  if (el.id === 'ega-shadow-host') return true;
  // Ega's own wrappers: a block already translated is not collected twice.
  if (el.hasAttribute('data-ega-tx') || el.hasAttribute('data-ega-replaced')) return true;
  if (el.getAttribute('translate') === 'no' || el.classList.contains('notranslate')) return true;
  if ((el as HTMLElement).hidden || el.getAttribute('aria-hidden') === 'true') return true;
  if (isSensitiveTarget(el)) return true;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  return style?.display === 'none' || style?.visibility === 'hidden';
}

function hasOwnText(el: Element): boolean {
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim() !== '') return true;
  }
  return false;
}

/** Letters in the text a reader sees, leaving out code, fields and hidden parts; stops counting at 2. */
function readableLetters(el: Element): number {
  let n = 0;
  for (const c of el.childNodes) {
    if (c.nodeType === Node.TEXT_NODE) n += c.nodeValue?.match(LETTER)?.length ?? 0;
    else if (c instanceof Element && !skipSubtree(c)) n += readableLetters(c);
    if (n >= 2) return n;
  }
  return n;
}

/** Fewer than 2 letters (numbers, a lone symbol) is nothing to translate. */
export function hasWords(text: string): boolean {
  return (text.match(LETTER)?.length ?? 0) >= 2;
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
    let inner = false;
    for (const child of el.children) if (visit(child)) inner = true;
    if (inner) return true;
    const tag = el.tagName.toUpperCase();
    if (!BLOCK_TAGS.has(tag) && !(CONTAINER_TAGS.has(tag) && hasOwnText(el))) return false;
    const text = el.textContent.trim();
    if (!hasWords(text) || readableLetters(el) < 2) return false;
    if (text.length > opts.maxChars) return true;
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
