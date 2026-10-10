import type { ErrCode } from '@/shared/types';
import { ensurePageStyles } from '../page-styles';
import { markLang } from '@/shared/lang-tag';
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
  /** In-place only: the block's own nodes before replacement. Restoring these keeps
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
    markLang(wrapper, undefined);
  };
  const showTranslation = (): void => {
    if (translationText === null) return;
    wrapper.textContent = translationText;
    markLang(wrapper, lang);
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
  // dir="auto" gives an RTL translation correct bidi on an LTR page; the original keeps the page's direction.
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

/** In-place: replace the original's children (or its leading run) with a streaming wrapper keyed by
 *  the stable block id. The captured fragment drives revert. */
export function mountInplace(args: MountArgs): RenderHandle {
  ensurePageStyles();
  const host = args.element as HTMLElement;
  const run = args.run === true;
  const nodes = run ? leadingRun(host) : [...host.childNodes];
  // The wrapper takes the run's place; the inner blocks after it stay where they are.
  const before = run ? (host.childNodes[nodes.length] ?? null) : null;
  const fragment = document.createDocumentFragment();
  for (const n of nodes) fragment.appendChild(n);
  const wrapper = document.createElement('span');
  wrapper.setAttribute('data-ega-replaced', args.id);
  wrapper.setAttribute('data-ega-id', args.id);
  if (run) wrapper.setAttribute('data-ega-run', '');
  // Translation streams into this wrapper. dir="auto" gives an RTL
  // translation correct bidi on the LTR host page.
  wrapper.setAttribute('dir', 'auto');
  markLang(wrapper, args.lang);
  wrapper.setAttribute('data-ega-pending', '');
  // The page keeps its own words, dimmed, until the translation starts to arrive.
  wrapper.appendChild(fragment.cloneNode(true));
  host.insertBefore(wrapper, before);
  const handle: RenderHandle = {
    id: args.id,
    mode: 'inplace',
    target: wrapper,
    originalText: args.originalText,
    originalNodes: fragment,
    revert: () => {
      if (run) {
        // The run's words go back where the wrapper stands; a page that took the wrapper away re-rendered them.
        if (wrapper.parentNode === host) wrapper.replaceWith(fragment);
        return;
      }
      // The page can re-populate the block while we stream; appending then duplicates its content.
      const ownsHost = host.childNodes.length === 1 && host.firstChild === wrapper;
      wrapper.remove();
      // Appending the fragment itself (not a clone) drains it, so a re-entrant revert no-ops.
      if (ownsHost) host.appendChild(fragment);
    },
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
  // A raw transport error must never become the block's text; the page keeps its own words and the chip names the cause.
  if (handle.mode === 'inplace' && handle.originalNodes) {
    target.replaceChildren(handle.originalNodes.cloneNode(true));
  } else {
    target.textContent = handle.mode === 'inplace' ? handle.originalText : '';
  }
  setPhase(handle, 'error');
  // The page's own text and our error chip are not in the target language.
  markLang(target, undefined);
  target.appendChild(mountErrorChip(err, opts));
}
