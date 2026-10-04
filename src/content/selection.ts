import { debugCatch } from '@/shared/logger';
import { MESSENGER_HOSTS } from '@/shared/site-presets';

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

/** Boilerplate and invisible subtrees contribute noise, not context. */
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
  const style = (el as HTMLElement).style as CSSStyleDeclaration | undefined;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return true;
  return false;
}

function createContextWalker(root: Node): TreeWalker {
  return document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
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
  return joined.length > budget ? joined.slice(joined.length - budget) : joined;
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
  return joined.length > budget ? joined.slice(0, budget) : joined;
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
  const beforeText = value.slice(Math.max(0, start - budget), start);
  const afterText = value.slice(end, end + budget);
  return { text, rect, range, beforeText, afterText };
}
