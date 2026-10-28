import { debugCatch } from '@/shared/logger';
import { MESSENGER_HOSTS } from '@/shared/site-presets';
import { capText, capTextFromEnd } from '@/shared/text-cap';
import { isSensitiveTarget } from './safety';

interface SelectionInfo {
  text: string;
  rect: DOMRect;
  range: Range;
  beforeText: string;
  afterText: string;
}

const CTX_CHARS = 200;
const CTX_CHARS_MESSENGER = 1000;

/** Messenger hosts keep the bigger budget as a floor, even when the user picks a narrow window. */
export function ctxBudget(hostOverride?: string, userCap?: number): number {
  const base = userCap ?? CTX_CHARS;
  try {
    const host = hostOverride ?? (typeof location !== 'undefined' ? location.hostname : '');
    return MESSENGER_HOSTS.has(host) ? Math.max(base, CTX_CHARS_MESSENGER) : base;
  } catch {
    return base;
  }
}

/** True when the range covers a form control or sits in editable content — inline replace would destroy the editor's DOM. */
export function isEditableRange(range: Range): boolean {
  const start = range.startContainer;
  if (start.nodeType === Node.ELEMENT_NODE && start === range.endContainer) {
    const el = start as Element;
    for (let i = range.startOffset; i < range.endOffset && i < el.childNodes.length; i++) {
      const n = el.childNodes[i];
      if (n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement) return true;
    }
  }
  for (let n: Node | null = range.commonAncestorContainer; n; n = n.parentNode) {
    if (n.nodeType !== Node.ELEMENT_NODE) continue;
    const el = n as HTMLElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
    const ce = el.getAttribute('contenteditable');
    if (ce === '' || ce === 'true' || ce === 'plaintext-only') return true;
    if (el.isContentEditable) return true;
  }
  return false;
}

/** The form control a `selectNode(field)` range wraps: how a field selection travels. */
export function wrappedField(range: Range): HTMLInputElement | HTMLTextAreaElement | null {
  const c = range.startContainer;
  if (c !== range.endContainer || range.endOffset - range.startOffset !== 1) return null;
  const n = c.childNodes[range.startOffset];
  return n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement ? n : null;
}

/** Every computed property that moves text inside a field's content box. */
const MIRRORED = [
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'font-stretch',
  'letter-spacing',
  'word-spacing',
  'line-height',
  'text-transform',
  'text-indent',
  'tab-size',
  'white-space',
  'word-break',
  'overflow-wrap',
  'direction',
  'unicode-bidi',
  'text-align',
];
/** The mirror lays out on every bubble shown during a drag; past this the field box is the anchor. */
const MIRROR_MAX_CHARS = 20_000;

/** The selected text's box relative to the field's box, as if the field were not scrolled; null when collapsed or too big to mirror. */
function textareaTextOffset(field: HTMLTextAreaElement): DOMRect | null {
  const { selectionStart: start, selectionEnd: end, value } = field;
  if (start === end) return null;
  const cs = getComputedStyle(field);
  // A code view never wraps, so only the selected lines need layout; a wrapping field lays out everything before them.
  const pre = cs.whiteSpace === 'pre' && cs.lineHeight.endsWith('px');
  const from = pre && start > 0 ? value.lastIndexOf('\n', start - 1) + 1 : 0;
  const nl = value.indexOf('\n', end);
  const to = nl === -1 ? value.length : nl;
  if (to - from > MIRROR_MAX_CHARS) return null;
  let rows = 0;
  for (let i = value.indexOf('\n'); i !== -1 && i < from; i = value.indexOf('\n', i + 1)) rows++;
  // A wrapping field's line-height may be `normal`, which is no number: its mirror starts at row 0.
  const skipped = pre ? rows * Number.parseFloat(cs.lineHeight) : 0;
  const fr = field.getBoundingClientRect();
  const m = document.createElement('div');
  m.style.setProperty('all', 'unset');
  for (const p of MIRRORED) m.style.setProperty(p, cs.getPropertyValue(p));
  Object.assign(m.style, {
    position: 'fixed',
    visibility: 'hidden',
    pointerEvents: 'none',
    display: 'block',
    boxSizing: 'content-box',
    margin: '0',
    border: '0',
    left: `${fr.left + field.clientLeft}px`,
    top: `${fr.top + field.clientTop + skipped}px`,
    width: `${Math.max(0, field.clientWidth - Number.parseFloat(cs.paddingLeft || '0') - Number.parseFloat(cs.paddingRight || '0'))}px`,
  });
  const span = document.createElement('span');
  // A page rule such as `span { padding: 4px }` must not move it.
  span.style.setProperty('all', 'unset');
  span.textContent = value.slice(start, end);
  // The rest of the last line keeps its soft-wrap points where the field has them.
  m.append(value.slice(from, start), span, value.slice(end, to));
  // The page sees this node, so callers measure only after the sensitive-field and site-off gates.
  document.documentElement.append(m);
  try {
    const r = span.getBoundingClientRect();
    return new DOMRect(r.left - fr.left, r.top - fr.top, r.width, r.height);
  } finally {
    m.remove();
  }
}

/** The offset placed on the field's current box and scroll, clipped to the field. */
function placeInField(field: HTMLTextAreaElement, off: DOMRect): DOMRect {
  const fr = field.getBoundingClientRect();
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  const left = clamp(fr.left + off.left - field.scrollLeft, fr.left, fr.right);
  const right = clamp(fr.left + off.right - field.scrollLeft, fr.left, fr.right);
  const top = clamp(fr.top + off.top - field.scrollTop, fr.top, fr.bottom);
  const bottom = clamp(fr.top + off.bottom - field.scrollTop, fr.top, fr.bottom);
  return new DOMRect(left, top, right - left, bottom - top);
}

/** Measures now and follows the page after: a textarea selection keeps its place in the field, so a scroll lays out
 *  nothing and a later caret move or selection in the field does not move it. Any other range reads its own box. */
export function trackSelectionRect(range: Range): () => DOMRect {
  const field = wrappedField(range);
  const off = field instanceof HTMLTextAreaElement ? textareaTextOffset(field) : null;
  return field instanceof HTMLTextAreaElement && off
    ? () => placeInField(field, off)
    : () => range.getBoundingClientRect();
}

/** A range's box now; a range that wraps one textarea measures its selected text. Lays out a mirror: call after the gates. */
export function selectionRectOf(range: Range): DOMRect {
  return trackSelectionRect(range)();
}

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DETAILS',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TD',
  'TH',
  'TR',
  'UL',
]);

/** Boilerplate, invisible and private subtrees (a draft, a field, `data-ega-skip`) never become context. */
function isSkippedElement(el: Element): boolean {
  const tag = el.tagName;
  if (
    tag === 'SCRIPT' ||
    tag === 'STYLE' ||
    tag === 'NOSCRIPT' ||
    tag === 'TEMPLATE' ||
    tag === 'NAV' ||
    tag === 'IFRAME'
  ) {
    return true;
  }
  if (el.getAttribute('role') === 'navigation') return true;
  if (el.hasAttribute('hidden')) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (el.id === 'ega-shadow-host' || el.hasAttribute('data-ega-replaced')) return true;
  if (isSensitiveTarget(el)) return true;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  return style?.display === 'none' || style?.visibility === 'hidden';
}

function createContextWalker(root: Node): TreeWalker {
  const doc = root.ownerDocument ?? document;
  return doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        return isSkippedElement(node as Element)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
}

function nearestBlock(node: Node): Node {
  for (let n: Node | null = node.parentNode; n; n = n.parentNode) {
    if (n.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((n as Element).tagName)) return n;
    if (n === document.body) return n;
  }
  return document.body;
}

interface ContextPiece {
  text: string;
  block: Node;
}

// Hard ceiling so a pathological DOM cannot turn one selection into a full-page walk.
const MAX_CONTEXT_NODES = 5000;

/** Joins pieces in document order, inserting a newline at each block boundary. */
function joinPieces(pieces: ContextPiece[]): string {
  let out = '';
  let prevBlock: Node | null = null;
  for (const p of pieces) {
    if (prevBlock !== null && p.block !== prevBlock) out += '\n';
    out += p.text;
    prevBlock = p.block;
  }
  return out.replace(/[^\S\n]*\n[^\S\n]*/g, '\n').replace(/\n{2,}/g, '\n');
}

function collapse(raw: string): string {
  return raw.replace(/\s+/g, ' ');
}

/** A TreeWalker never filters its root, so the root and its ancestors get the walker's skip rules here. */
function isInsideSkipped(root: Node): boolean {
  let el = root.nodeType === Node.ELEMENT_NODE ? (root as Element) : root.parentElement;
  for (; el; el = el.parentElement) if (isSkippedElement(el)) return true;
  return false;
}

/** The words a reader sees under `root`, by the context walker's rules, on one line; stops once it holds `cap` chars. */
export function visibleText(root: Node, cap = Number.POSITIVE_INFINITY): string {
  if (isInsideSkipped(root)) return '';
  const pieces: ContextPiece[] = [];
  let total = 0;
  const walker = createContextWalker(root);
  for (let node = walker.nextNode(); node && total < cap; node = walker.nextNode()) {
    const t = collapse(node.textContent ?? '');
    if (!t) continue;
    pieces.push({ text: t, block: nearestBlock(node) });
    total += t.length;
  }
  return collapse(joinPieces(pieces)).trim();
}

/** Visible text before the selection in reading order, crossing block boundaries up to `budget` chars. */
function collectContextBefore(range: Range, budget: number): string {
  const root = document.body;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- pre-parse documents have no body
  if (!root || budget <= 0 || !root.contains(range.startContainer)) return '';
  const pieces: ContextPiece[] = [];
  let total = 0;
  const start = range.startContainer;
  if (start.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
    const t = collapse((start.textContent ?? '').slice(0, range.startOffset));
    if (t) {
      pieces.push({ text: t, block: nearestBlock(start) });
      total += t.length;
    }
  }
  const walker = createContextWalker(root);
  walker.currentNode = start;
  let visited = 0;
  while (total < budget && ++visited <= MAX_CONTEXT_NODES) {
    const node = walker.previousNode();
    if (!node) break;
    const t = collapse(node.textContent ?? '');
    if (!t) continue;
    pieces.push({ text: t, block: nearestBlock(node) });
    total += t.length;
  }
  pieces.reverse();
  const joined = joinPieces(pieces);
  return capTextFromEnd(joined, budget);
}

/** Visible text after the selection in reading order, crossing block boundaries up to `budget` chars. */
function collectContextAfter(range: Range, budget: number): string {
  const root = document.body;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- pre-parse documents have no body
  if (!root || budget <= 0 || !root.contains(range.endContainer)) return '';
  const pieces: ContextPiece[] = [];
  let total = 0;
  const end = range.endContainer;
  if (end.nodeType === Node.TEXT_NODE) {
    const t = collapse((end.textContent ?? '').slice(range.endOffset));
    if (t) {
      pieces.push({ text: t, block: nearestBlock(end) });
      total += t.length;
    }
  }
  const walker = createContextWalker(root);
  // A range ending on an element (a triple-click) covers its first endOffset children; start after them, not inside them.
  let from: Node = end;
  if (end.nodeType === Node.ELEMENT_NODE && range.endOffset > 0) {
    from = end.childNodes[range.endOffset - 1] ?? end;
    while (from.lastChild) from = from.lastChild;
  }
  walker.currentNode = from;
  let visited = 0;
  while (total < budget && ++visited <= MAX_CONTEXT_NODES) {
    const node = walker.nextNode();
    if (!node) break;
    const t = collapse(node.textContent ?? '');
    if (!t) continue;
    pieces.push({ text: t, block: nearestBlock(node) });
    total += t.length;
  }
  const joined = joinPieces(pieces);
  return capText(joined, budget);
}

export function getSelectionInfo(userCap?: number, includeContext = true): SelectionInfo | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    // `window.getSelection()` never reaches into form-control internals.
    return getEditableSelectionInfo(userCap, includeContext);
  }
  const range = sel.getRangeAt(0);
  const text = sel.toString().trim();
  if (!text) return null;
  const rect = range.getBoundingClientRect();
  // The walk below is proportional to the budget; only the translate path pays for it.
  if (!includeContext) return { text, rect, range, beforeText: '', afterText: '' };
  const budget = ctxBudget(undefined, userCap);
  const beforeText = collectContextBefore(range, budget);
  const afterText = collectContextAfter(range, budget);
  return { text, rect, range, beforeText, afterText };
}

function getEditableSelectionInfo(userCap?: number, includeContext = true): SelectionInfo | null {
  const el = document.activeElement;
  if (!el) return null;
  const isFormField =
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement &&
      (el.type === 'text' || el.type === 'search' || el.type === 'url' || el.type === 'email'));
  if (!isFormField) return null;
  const field = el as HTMLTextAreaElement | HTMLInputElement;
  const start = field.selectionStart;
  const end = field.selectionEnd;
  if (start === null || end === null || start === end) return null;
  const value = field.value;
  const text = value.slice(start, end).trim();
  if (!text) return null;
  // The field box: measuring the text lays out page DOM, so it waits for the gates (selectionRectOf on this range).
  const rect = field.getBoundingClientRect();
  // A Range can't point inside a form control, so anchor it at the element.
  const range = document.createRange();
  try {
    range.selectNode(field);
  } catch (e) {
    debugCatch(e, 'content.selection.1');
  }
  if (!includeContext) return { text, rect, range, beforeText: '', afterText: '' };
  const budget = ctxBudget(undefined, userCap);
  const beforeText = capTextFromEnd(value.slice(0, start), budget);
  const afterText = capText(value.slice(end), budget);
  return { text, rect, range, beforeText, afterText };
}
