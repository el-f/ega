import type { ErrCode } from '@/shared/types';
import { ensurePageStyles } from '../page-styles';
import { markLang } from '@/shared/lang-tag';
import { textDir } from '../text-dir';
import { mountErrorChip, type ChipOpts } from '../page-chip';
import { leadingRun } from './collect';
import type { RenderMode } from './store';

export interface MountArgs {
  id: string;
  element: Element;
  originalText: string;
  /** Tag of the target language; absent leaves the attribute out. */
  lang?: string | undefined;
  /** Only the element's leading run, the words before its first inner block; the inner blocks stay as they are. */
  run?: boolean;
}

/** Marks what the box shows: the translation with its tag and direction, or with `undefined` the page's own words. */
function markShown(el: Element, tag: string | undefined): void {
  markLang(el, tag);
  el.setAttribute('dir', textDir(tag));
}

/** Sticky after the first terminal: a late chunk must not re-paint a settled block. */
export type BlockPhase = 'streaming' | 'ok' | 'error';

export interface RenderHandle {
  id: string;
  mode: RenderMode;
  /** The element the translation streams into — the inserted sibling
   *  (bilingual) or the replacement wrapper (in-place). */
  target: HTMLElement;
  /** Plain-text original, kept so an error can restore a readable block
   *  instead of leaving an empty or error-filled slot. */
  originalText: string;
  /** In-place only: a copy of the block's own nodes, for the pending look and a peek. Showing it keeps
   *  links, emphasis and inline images that the flat text drops. */
  originalNodes?: DocumentFragment;
  revert: () => void;
  /** View toggle for the settled pill: show the page's own text. */
  showOriginal: () => void;
  showTranslation: () => void;
  visibleText: string;
  phase: BlockPhase;
}

/** The attribute mirrors the phase for the page stylesheet and the e2e probes. */
function setPhase(handle: RenderHandle, phase: BlockPhase): void {
  handle.phase = phase;
  handle.target.setAttribute('data-ega-tx-state', phase);
  // One pending look until the first words land: the original dimmed (or an empty bar) with one spinner.
  if (phase !== 'streaming') handle.target.removeAttribute('data-ega-pending');
}

interface InplaceSwap {
  showOriginal: () => void;
  showTranslation: () => void;
}

// While the pill shows the whole original page, per-wrapper peek listeners must not flip single blocks back.
let globalOriginalView = false;

export function setGlobalOriginalView(on: boolean): void {
  globalOriginalView = on;
}

function attachInplaceSwap(
  handle: RenderHandle,
  originalNodes: DocumentFragment,
  lang: string | undefined,
): InplaceSwap {
  const wrapper = handle.target;
  let translationText: string | null = null;
  const showOriginal = (): void => {
    // Only a settled translation swaps — an error wrapper holds chip elements textContent would flatten.
    if (handle.phase !== 'ok') return;
    // Already peeking: re-reading textContent here would save the ORIGINAL as the translation.
    if (translationText !== null) return;
    translationText = wrapper.textContent;
    // Clone: the fragment itself is what `revert` puts back on the page.
    wrapper.replaceChildren(originalNodes.cloneNode(true));
    markShown(wrapper, undefined);
    // The page sheet keeps the copy's own spacing, not the translation's line breaks.
    wrapper.setAttribute('data-ega-peek', '');
  };
  const showTranslation = (): void => {
    if (translationText === null) return;
    wrapper.textContent = translationText;
    markShown(wrapper, lang);
    wrapper.removeAttribute('data-ega-peek');
    translationText = null;
  };
  const peek = (fn: () => void) => (): void => {
    if (!globalOriginalView) fn();
  };
  wrapper.addEventListener('mousedown', peek(showOriginal));
  wrapper.addEventListener('mouseup', peek(showTranslation));
  // mouseup fires on whatever is under the cursor, so a release outside never reaches us.
  wrapper.addEventListener('mouseleave', peek(showTranslation));
  return { showOriginal, showTranslation };
}

/** A cell, list item, definition or summary gets its translation inside it: a sibling of the same tag would add a
 *  cell to the row or a numbered item to the list, and a box after a summary hides in its closed details. */
const INSIDE = new Set(['TD', 'TH', 'LI', 'DD', 'DT', 'SUMMARY']);

/** A child of a flex or grid parent is a layout slot, so a sibling box would be one more tile or column. */
function boxGoesInside(el: Element): boolean {
  if (INSIDE.has(el.tagName.toUpperCase())) return true;
  const parent = el.parentElement;
  return parent !== null && /flex|grid/.test(globalThis.getComputedStyle(parent).display);
}

/** Built-ins a plain div would break: each carries meaning of its own, a heading in the outline, `pre`'s line breaks. */
const KEEP_TAG = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'figcaption']);

/** Cloning a custom page tag (ytd-comment) can start a live page component, so only the KEEP_TAG built-ins keep their tag; everything else becomes a div or span that matches its display. */
function siblingTag(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (KEEP_TAG.has(tag)) return tag;
  const display = globalThis.getComputedStyle(el).display;
  return display.startsWith('inline') ? 'span' : 'div';
}

/**
 * Bilingual: insert a neutral box after the original, or inside a cell or list item; a leading run's box goes
 * right after the run, before the first inner block. Original DOM is left untouched.
 */
export function mountBilingual(args: MountArgs): RenderHandle {
  ensurePageStyles();
  const run = args.run === true;
  const inside = !run && boxGoesInside(args.element);
  // A summary holds phrasing content only, so its box is a span the page sheet shows as a block.
  const summary = args.element.tagName.toUpperCase() === 'SUMMARY';
  const sibling = document.createElement(
    run ? 'div' : inside ? (summary ? 'span' : 'div') : siblingTag(args.element),
  );
  sibling.setAttribute('data-ega-tx', '');
  if (inside) sibling.setAttribute('data-ega-inside', '');
  if (run) sibling.setAttribute('data-ega-run', '');
  sibling.setAttribute('data-ega-id', args.id);
  // The box follows its text until the translation lands; the original keeps the page's direction.
  sibling.setAttribute('dir', 'auto');
  markLang(sibling, args.lang);
  sibling.setAttribute('data-ega-pending', '');
  // A heading's translation reads as a heading at 85% of its size, so the two do not compete.
  if (/^H[1-6]$/.test(args.element.tagName)) {
    const px = Number.parseFloat(globalThis.getComputedStyle(args.element).fontSize);
    if (px > 0) sibling.style.fontSize = `${Math.round(px * 0.85)}px`; // token-lint-allow sized off the page's heading
  }
  if (run) {
    const host = args.element;
    host.insertBefore(sibling, host.childNodes[leadingRun(host).length] ?? null);
  } else if (inside) args.element.append(sibling);
  else args.element.after(sibling);
  const handle: RenderHandle = {
    id: args.id,
    mode: 'bilingual',
    target: sibling,
    originalText: args.originalText,
    revert: () => sibling.remove(),
    // The original stays on the page in bilingual mode, so "show original" just hides the insert.
    showOriginal: () => {
      sibling.style.display = 'none';
    },
    showTranslation: () => {
      sibling.style.removeProperty('display');
    },
    visibleText: '',
    phase: 'streaming',
  };
  setPhase(handle, 'streaming');
  return handle;
}

/**
 * A block that failed in a closed session still shows its error; a new try first puts its page words back. A
 * leading run clears only its own mark, never the failed box of a block inside the same element.
 */
export function clearStaleError(el: Element, run = false): void {
  const failed = (m: Element | null): m is Element =>
    m?.getAttribute('data-ega-tx-state') === 'error';
  const next = el.nextElementSibling;
  if (!run && failed(next) && next.hasAttribute('data-ega-tx')) next.remove();
  for (const c of [...el.children]) {
    if (!failed(c) || c.hasAttribute('data-ega-run') !== run) continue;
    if (c.hasAttribute('data-ega-tx')) {
      c.remove();
      continue;
    }
    c.querySelector(':scope > [data-ega-tx-error]')?.remove();
    c.replaceWith(...c.childNodes);
  }
}

/** Marks a page element Ega hides in place; the page sheet sets `display: none` on it. */
const HIDDEN_ATTR = 'data-ega-hidden';

/** Each in-place wrapper's way to show the page's own nodes again. */
const showPageFor = new WeakMap<Element, () => void>();

/**
 * Hides a block's own nodes where they stand: a text node is emptied, an element gets Ega's hide mark. A framework
 * that still holds them can move or remove them. Returns the undo; a text the page rewrote since keeps its new words.
 * New words the page writes into an emptied text node would show beside the translation, so they call `onPageWrite`.
 */
function hideInPlace(nodes: readonly ChildNode[], onPageWrite: () => void): () => void {
  const texts = new Map<CharacterData, string>();
  const elements: Element[] = [];
  for (const n of nodes) {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n as CharacterData;
      texts.set(t, t.data);
      t.data = '';
    } else if (n instanceof Element && !n.hasAttribute(HIDDEN_ATTR)) {
      n.setAttribute(HIDDEN_ATTR, '');
      elements.push(n);
    }
  }
  const writes = new MutationObserver((records) => {
    if (records.some((r) => (r.target as CharacterData).data !== '')) onPageWrite();
  });
  for (const t of texts.keys()) writes.observe(t, { characterData: true });
  return () => {
    writes.disconnect();
    for (const [t, data] of texts) if (t.data === '') t.data = data;
    for (const el of elements) el.removeAttribute(HIDDEN_ATTR);
    texts.clear();
    elements.length = 0;
  };
}

/**
 * In-place: hide the original's children (or its leading run) where they stand and show a streaming wrapper,
 * keyed by the stable block id, after them. The page's nodes never leave the page, so its framework keeps them.
 */
export function mountInplace(args: MountArgs): RenderHandle {
  ensurePageStyles();
  const host = args.element as HTMLElement;
  const run = args.run === true;
  const nodes = run ? leadingRun(host) : [...host.childNodes];
  // A run's wrapper stands before the first inner block; the inner blocks stay where they are.
  const before = run ? (host.childNodes[nodes.length] ?? null) : null;
  const fragment = document.createDocumentFragment();
  for (const n of nodes) fragment.appendChild(n.cloneNode(true));
  const wrapper = document.createElement('span');
  wrapper.setAttribute('data-ega-replaced', args.id);
  wrapper.setAttribute('data-ega-id', args.id);
  if (run) wrapper.setAttribute('data-ega-run', '');
  // The page's words show dimmed here until the translation lands, so the wrapper follows its text until then.
  wrapper.setAttribute('dir', 'auto');
  markLang(wrapper, args.lang);
  wrapper.setAttribute('data-ega-pending', '');
  // The page keeps its own words, dimmed, until the translation starts to arrive.
  wrapper.appendChild(fragment.cloneNode(true));
  host.insertBefore(wrapper, before);
  // A node the page added to the block, or one it wrote since, stays as the page left it.
  const revert = (): void => {
    showPage();
    wrapper.remove();
  };
  // The page rewrote the block: its words come back, and with the wrapper gone the next pass takes the block again.
  const showPage = hideInPlace(nodes, revert);
  showPageFor.set(wrapper, showPage);
  const handle: RenderHandle = {
    id: args.id,
    mode: 'inplace',
    target: wrapper,
    originalText: args.originalText,
    originalNodes: fragment,
    revert,
    showOriginal: () => {},
    showTranslation: () => {},
    visibleText: '',
    phase: 'streaming',
  };
  setPhase(handle, 'streaming');
  // The peek reads the handle's phase, so it attaches after the handle exists.
  const swap = attachInplaceSwap(handle, fragment, args.lang);
  handle.showOriginal = swap.showOriginal;
  handle.showTranslation = swap.showTranslation;
  return handle;
}

function render(handle: RenderHandle): void {
  if (handle.phase !== 'streaming') return;
  const text = handle.visibleText;
  if (text.length === 0) return;
  handle.target.removeAttribute('data-ega-pending');
  handle.target.textContent = text;
  // An RTL target reads right to left even when the translation starts with a Latin word ("iPhone 15 ...").
  handle.target.setAttribute('dir', textDir(handle.target.getAttribute('lang')));
}

export function appendDelta(handle: RenderHandle, delta: string, replace?: true): void {
  if (handle.phase !== 'streaming') return;
  handle.visibleText = replace ? delta : handle.visibleText + delta;
  render(handle);
}

export function finish(handle: RenderHandle, text?: string): void {
  if (handle.phase !== 'streaming') return;
  if (text !== undefined) handle.visibleText = text;
  render(handle);
  setPhase(handle, 'ok');
}

/** Swaps a failed block's chip for a fresh one, e.g. once a setting changed. */
export function remountErrorChip(
  handle: RenderHandle,
  err: { code: ErrCode; message: string },
  opts: ChipOpts,
): void {
  if (handle.phase !== 'error') return;
  handle.target.querySelector('[data-ega-tx-error]')?.replaceWith(mountErrorChip(err, opts));
}

export function mountError(
  handle: RenderHandle,
  err: { code: ErrCode; message: string },
  opts?: ChipOpts,
): void {
  if (handle.phase !== 'streaming') return;
  const { target } = handle;
  // A raw transport error must never become the block's text; the page shows its own words and the chip names the cause.
  if (handle.mode === 'inplace') showPageFor.get(target)?.();
  target.textContent = '';
  setPhase(handle, 'error');
  // The page's own text and our error chip are not in the target language.
  markShown(target, undefined);
  target.appendChild(mountErrorChip(err, opts));
}
