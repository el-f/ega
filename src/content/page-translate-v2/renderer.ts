import { createMemoizedJsonParser, streamingTranslation } from '@/shared/backends/base';
import type { ErrCode } from '@/shared/types';
import { errCodeLabel } from '@/shared/err-labels';
import { ensurePageStyles } from '../page-styles';
import { markLang } from '@/shared/lang-tag';
import { isUserGesture } from '../user-gesture';
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

const PLACEHOLDER = '…';
const PEEK_HINT = 'Hold the mouse button down to see the original';

/** The attribute mirrors the phase for the page stylesheet and the e2e probes. */
function setPhase(handle: RenderHandle, phase: BlockPhase): void {
  handle.phase = phase;
  handle.target.setAttribute('data-ega-tx-state', phase);
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

/** Built-ins a plain div would break: the first group needs its parent's box (row, list),
 *  the second carries meaning of its own — a heading in the outline, `pre`'s line breaks. */
const KEEP_TAG = new Set([
  'td',
  'th',
  'li',
  'dd',
  'dt',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'pre',
  'blockquote',
  'figcaption',
]);

/** Cloning a custom page tag (ytd-comment) can start a live page component, so only the KEEP_TAG built-ins keep their tag; everything else becomes a div or span that matches its display. */
function siblingTag(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (KEEP_TAG.has(tag)) return tag;
  const display = globalThis.getComputedStyle(el).display;
  return display.startsWith('inline') ? 'span' : 'div';
}

/** Bilingual: insert a neutral sibling AFTER the original. Original DOM is left untouched. */
export function mountBilingual(args: MountArgs): RenderHandle {
  ensurePageStyles();
  const sibling = document.createElement(siblingTag(args.element));
  sibling.setAttribute('data-ega-tx', '');
  sibling.setAttribute('data-ega-id', args.id);
  // dir="auto" gives an RTL translation correct bidi on an LTR page; the original keeps the page's direction.
  sibling.setAttribute('dir', 'auto');
  markLang(sibling, args.lang);
  sibling.textContent = PLACEHOLDER;
  args.element.after(sibling);
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
  wrapper.textContent = PLACEHOLDER;
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
  // Empty during the JSON-envelope phase — keep the placeholder so the block
  // never collapses to zero text (the same discipline as inlineReplace).
  if (text.length === 0) {
    if (handle.target.textContent !== PLACEHOLDER) handle.target.textContent = PLACEHOLDER;
    return;
  }
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
  // Only the in-place wrapper has the press-to-peek gesture; bilingual keeps the original on the page.
  if (handle.mode === 'inplace') handle.target.title = PEEK_HINT;
}

export function mountError(
  handle: RenderHandle,
  err: { code: ErrCode; message: string },
  opts?: { onRetry?: () => void },
): void {
  if (handle.phase !== 'streaming') return;
  const { target } = handle;
  const detail = `${errCodeLabel(err.code)}: ${err.message}`;
  // A raw transport error must never become the block's text; the detail goes in `title` instead.
  if (handle.mode === 'inplace' && handle.originalNodes) {
    target.replaceChildren(handle.originalNodes.cloneNode(true));
  } else {
    target.textContent = handle.mode === 'inplace' ? handle.originalText : '';
  }
  setPhase(handle, 'error');
  // The page's own text and our error chip are not in the target language.
  markLang(target, undefined);

  const chip = document.createElement('span');
  chip.setAttribute('data-ega-tx-error', '');
  chip.title = detail;
  chip.textContent = `⚠ ${errCodeLabel(err.code)}`;
  target.appendChild(chip);

  if (opts?.onRetry) {
    const { onRetry } = opts;
    const btn = document.createElement('button');
    btn.setAttribute('data-ega-retry-block', '');
    btn.setAttribute('aria-label', 'Retry translation');
    btn.title = detail;
    btn.textContent = '↻';
    // The button lives in the page's own DOM, so a page script can click it; only a real click re-dispatches.
    btn.onclick = (e) => {
      if (isUserGesture(e)) onRetry();
    };
    target.appendChild(btn);
  }
}
