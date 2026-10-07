import { createMemoizedJsonParser, streamingTranslation } from '@/shared/backends/base';
import type { ErrCode } from '@/shared/types';
import { ensurePageStyles } from '../page-styles';
import { markLang } from '@/shared/lang-tag';
import { mountErrorChip } from '../page-chip';
import type { RenderMode } from './store';

export interface MountArgs {
  id: string;
  element: Element;
  originalText: string;
  /** Tag of the target language; absent leaves the attribute out. */
  lang?: string | undefined;
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
  rawAcc: string;
  parseJson: ReturnType<typeof createMemoizedJsonParser>;
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

/** A cell, list item or definition gets its translation inside it (D46): a sibling of the same tag would add a
 *  cell to the row or a numbered item to the list. */
const INSIDE = new Set(['TD', 'TH', 'LI', 'DD', 'DT']);

/** Built-ins a plain div would break: each carries meaning of its own, a heading in the outline, `pre`'s line breaks. */
const KEEP_TAG = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'figcaption']);

/** Cloning a custom page tag (ytd-comment) can start a live page component, so only the KEEP_TAG built-ins keep their tag; everything else becomes a div or span that matches its display. */
function siblingTag(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (KEEP_TAG.has(tag)) return tag;
  const display = globalThis.getComputedStyle(el).display;
  return display.startsWith('inline') ? 'span' : 'div';
}

/** Bilingual: insert a neutral box after the original, or inside a cell or list item. Original DOM is left untouched. */
export function mountBilingual(args: MountArgs): RenderHandle {
  ensurePageStyles();
  const inside = INSIDE.has(args.element.tagName.toUpperCase());
  const sibling = document.createElement(inside ? 'div' : siblingTag(args.element));
  sibling.setAttribute('data-ega-tx', '');
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
  if (inside) args.element.append(sibling);
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
    rawAcc: '',
    parseJson: createMemoizedJsonParser(),
    phase: 'streaming',
  };
  setPhase(handle, 'streaming');
  return handle;
}

/** A block that failed in a closed session still shows its error; a new try first puts its page words back. */
export function clearStaleError(el: Element): void {
  const failed = (m: Element | null): m is Element =>
    m?.getAttribute('data-ega-tx-state') === 'error';
  const next = el.nextElementSibling;
  if (failed(next) && next.hasAttribute('data-ega-tx')) next.remove();
  for (const c of [...el.children]) {
    if (!failed(c)) continue;
    if (c.hasAttribute('data-ega-tx')) {
      c.remove();
      continue;
    }
    c.querySelector(':scope > [data-ega-tx-error]')?.remove();
    c.replaceWith(...c.childNodes);
  }
}

/** In-place: replace the original's children with a streaming wrapper keyed by
 *  the stable block id. The captured fragment drives revert. */
export function mountInplace(args: MountArgs): RenderHandle {
  ensurePageStyles();
  const host = args.element as HTMLElement;
  const fragment = document.createDocumentFragment();
  while (host.firstChild) fragment.appendChild(host.firstChild);
  const wrapper = document.createElement('span');
  wrapper.setAttribute('data-ega-replaced', args.id);
  wrapper.setAttribute('data-ega-id', args.id);
  // Translation streams into this wrapper. dir="auto" gives an RTL
  // translation correct bidi on the LTR host page.
  wrapper.setAttribute('dir', 'auto');
  markLang(wrapper, args.lang);
  wrapper.setAttribute('data-ega-pending', '');
  // The page keeps its own words, dimmed, until the translation starts to arrive.
  wrapper.appendChild(fragment.cloneNode(true));
  host.appendChild(wrapper);
  const handle: RenderHandle = {
    id: args.id,
    mode: 'inplace',
    target: wrapper,
    originalText: args.originalText,
    originalNodes: fragment,
    revert: () => {
      // The page can re-populate the block while we stream; appending then duplicates its content.
      const ownsHost = host.childNodes.length === 1 && host.firstChild === wrapper;
      wrapper.remove();
      // Appending the fragment itself (not a clone) drains it, so a re-entrant revert no-ops.
      if (ownsHost) host.appendChild(fragment);
    },
    showOriginal: () => {},
    showTranslation: () => {},
    rawAcc: '',
    parseJson: createMemoizedJsonParser(),
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
  const parsed = handle.parseJson(handle.rawAcc);
  const text = streamingTranslation(handle.rawAcc, parsed);
  // Empty during the JSON-envelope phase: the pending look stays, so the block never collapses to nothing.
  if (text.length === 0) return;
  handle.target.removeAttribute('data-ega-pending');
  handle.target.textContent = text;
}

export function appendDelta(handle: RenderHandle, delta: string): void {
  if (handle.phase !== 'streaming') return;
  handle.rawAcc += delta;
  render(handle);
}

export function finish(handle: RenderHandle): void {
  if (handle.phase !== 'streaming') return;
  render(handle);
  setPhase(handle, 'ok');
}

export function mountError(
  handle: RenderHandle,
  err: { code: ErrCode; message: string },
  opts?: { onRetry?: () => void; backend?: string },
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
  target.appendChild(
    mountErrorChip(err, {
      ...(opts?.onRetry ? { onRetry: opts.onRetry } : {}),
      ...(opts?.backend ? { backend: opts.backend } : {}),
    }),
  );
}
