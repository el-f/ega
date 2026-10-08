import { createMemoizedJsonParser, streamingTranslation } from '@/shared/backends/base';
import { ensurePageStyles } from './page-styles';
import type { ErrCode } from '@/shared/types';
import { langTag, markLang, replyLang } from '@/shared/lang-tag';
import {
  beginRequest,
  endRequest,
  pending,
  releaseRequest,
  setRenderer,
  stopRequestStream,
  type DoneMeta,
} from './request-state';
import { showToast } from './toast';
import { peekContainer } from './shadowHost';
import { mountErrorChip } from './page-chip';

/** Only in-flight translates live here; a settled one is dropped so the page can detach it. */
interface InlineEntry {
  wrapper: HTMLSpanElement;
  original: DocumentFragment;
  originalText: string;
  rawAcc: string;
  parseJson: ReturnType<typeof createMemoizedJsonParser>;
  /** Fails a wrapper whose worker went silent, instead of shimmering forever. */
  stuckTimerId: ReturnType<typeof setTimeout>;
  /** Ceiling the guard re-arms with after every delta. */
  stuckMs: number;
  /** Tag of the language the answer is in; the original text never carries it. */
  lang: string | undefined;
}

const entries = new Map<string, InlineEntry>();
let escListenerActive = false;

// Keyed on the wrapper, so a settled block's undo copy dies with the node the page detaches.
const settledOriginals = new WeakMap<HTMLElement, DocumentFragment>();

export interface OpenInlineOpts {
  requestId: string;
  range: Range;
  /** Ceiling for the stuck guard; the caller derives it from the timeout the router really uses. */
  stuckTimeoutMs: number;
}

/** False when the range crosses partial element boundaries; the caller falls back to the tooltip. */
export function openInline(opts: OpenInlineOpts): boolean {
  if (entries.has(opts.requestId)) return true;
  ensurePageStyles();
  const wrapper = document.createElement('span');
  wrapper.setAttribute('data-ega-replaced', opts.requestId);
  // The host page is LTR; dir="auto" keeps bidi right when translating into Arabic or Hebrew.
  wrapper.setAttribute('dir', 'auto');

  let original: DocumentFragment;
  let originalText: string;

  try {
    originalText = opts.range.toString();
    const clone = opts.range.cloneContents();
    original = clone;
    opts.range.surroundContents(wrapper);
  } catch {
    // Partial-boundary range. Bail rather than risk corrupting page DOM.
    return false;
  }

  // The original stays readable (dimmed via CSS) until the first real delta swaps it out.
  wrapper.setAttribute('data-ega-pending', '');
  wrapper.dataset['egaOriginal'] = originalText;
  // Wrapping fires selectionchange on a selection that still holds the text, which would bring the bubble back.
  collapseSelectionAfter(wrapper);

  // The caller registers the request before opening, so its task and direction are already there.
  const req = pending.get(opts.requestId);
  const lang = req && langTag(replyLang(req.task ?? 'translate', req.targetLang, req.sourceLang));

  // Wrapping the range is taking the request: the rows are this module's from here until the span settles.
  beginRequest(opts.requestId, 'inline');
  entries.set(opts.requestId, {
    wrapper,
    original,
    originalText,
    rawAcc: '',
    parseJson: createMemoizedJsonParser(),
    stuckTimerId: armStuckGuard(opts.requestId, opts.stuckTimeoutMs),
    stuckMs: opts.stuckTimeoutMs,
    lang,
  });

  ensureEscListener();
  return true;
}

function armStuckGuard(requestId: string, stuckMs: number): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    if (!entries.has(requestId)) return;
    // Giving up here leaves the worker streaming unless the stream is stopped too.
    stopRequestStream(requestId);
    errorInline(requestId, { code: 'TIMEOUT', message: 'No reply in time. Try again.' });
  }, stuckMs);
}

export function appendInlineDelta(requestId: string, delta: string): void {
  const e = entries.get(requestId);
  if (!e) return;
  // A stream that dies mid-body takes the worker's own timer with it, so every delta re-arms this guard.
  clearTimeout(e.stuckTimerId);
  e.stuckTimerId = armStuckGuard(requestId, e.stuckMs);
  e.rawAcc += delta;
  const parsed = e.parseJson(e.rawAcc);
  const text = streamingTranslation(e.rawAcc, parsed);
  renderProgress(e.wrapper, text, e.lang);
}

function settledWrappers(): HTMLElement[] {
  // The data-ega-original attr separates inline-replace wrappers from page-translate ones.
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-ega-replaced][data-ega-original]'),
  );
}

function settle(requestId: string, timerId: ReturnType<typeof setTimeout>): void {
  clearTimeout(timerId);
  entries.delete(requestId);
  // Inline has no Retry or Explain, so nothing needs the request rows after this point.
  releaseRequest(requestId);
  releaseEscIfIdle();
}

/** Esc stays armed while settled wrappers remain, so it can still put the page back. */
function releaseEscIfIdle(): void {
  if (entries.size === 0 && settledWrappers().length === 0) removeEscListener();
}

export function finishInline(requestId: string, _meta?: DoneMeta): void {
  const e = entries.get(requestId);
  if (!e) return;
  const { wrapper, originalText, lang } = e;
  const parsed = e.parseJson(e.rawAcc);
  const text = streamingTranslation(e.rawAcc, parsed);
  // A `done` with no text is a failure the user can retry from, not a shimmer that never ends.
  if (text.length === 0) {
    errorInline(requestId, { code: 'EMPTY', message: 'The backend returned no text.' });
    return;
  }
  settledOriginals.set(wrapper, e.original);
  renderProgress(wrapper, text, lang);
  wrapper.removeAttribute('data-ega-pending');
  // Native title: the shadow-scoped data-tooltip styles can't reach this light-DOM wrapper.
  wrapper.setAttribute('title', truncateTitle(originalText));
  const showOriginal = (): void => renderText(wrapper, originalText);
  const showTranslation = (): void => renderProgress(wrapper, text, lang);
  wrapper.addEventListener('mousedown', showOriginal);
  wrapper.addEventListener('mouseup', showTranslation);
  wrapper.addEventListener('mouseleave', showTranslation);
  settle(requestId, e.stuckTimerId);
  collapseSelectionAfter(wrapper);
  // Every replace offers Undo, not just the first: the page text changed and the way back must be in view.
  dismissUndoHint = showToast('Replaced with the translation.', {
    kind: 'success',
    action: { label: 'Undo', run: () => restoreInline(requestId) },
  });
}

let dismissUndoHint: (() => void) | null = null;

/**
 * The selection would keep highlighting text that is no longer what the user picked. Only a selection still on the
 * wrapper moves: one the user made elsewhere, or a caret in a field, stays where it is.
 */
function collapseSelectionAfter(wrapper: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !wrapper.isConnected) return;
  if (!sel.getRangeAt(0).intersectsNode(wrapper)) return;
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && isEditable(focused) && !focused.contains(wrapper)) return;
  const r = document.createRange();
  r.selectNodeContents(wrapper);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

function isEditable(el: HTMLElement): boolean {
  return el.isContentEditable || el.matches('input, textarea, select');
}

export function errorInline(
  requestId: string,
  err: { code: ErrCode | 'EMPTY'; message: string },
): void {
  const e = entries.get(requestId);
  if (!e) return;
  settledOriginals.set(e.wrapper, e.original);
  e.wrapper.setAttribute('data-ega-error', 'true');
  // Error state surfaces the original text directly — nothing to translate.
  renderText(e.wrapper, e.originalText);
  // The same chip page translate uses names the cause; inline replace has no retry of its own.
  // Nothing else says the replace failed, so the chip is announced.
  e.wrapper.appendChild(mountErrorChip(err, { announce: true }));
  settle(requestId, e.stuckTimerId);
  collapseSelectionAfter(e.wrapper);
}

export function restoreInline(requestId: string): void {
  const e = entries.get(requestId);
  if (!e) {
    restoreSettledWrapper(requestId);
    return;
  }
  e.wrapper.replaceWith(e.original.cloneNode(true));
  settle(requestId, e.stuckTimerId);
}

function restoreSettledWrapper(requestId: string): void {
  const wrapper = Array.from(document.querySelectorAll<HTMLElement>('[data-ega-replaced]')).find(
    (w) => w.getAttribute('data-ega-replaced') === requestId,
  );
  if (!wrapper) return;
  restoreWrapper(wrapper);
  releaseEscIfIdle();
}

/** The saved fragment brings links, emphasis and inline images back; flat text is the fallback. */
function restoreWrapper(wrapper: HTMLElement): void {
  const original = settledOriginals.get(wrapper);
  settledOriginals.delete(wrapper);
  wrapper.replaceWith(
    original
      ? original.cloneNode(true)
      : document.createTextNode(wrapper.dataset['egaOriginal'] ?? ''),
  );
}

export function restoreAllInline(): void {
  // Ending a request restores its wrapper through the renderer registered below.
  for (const id of Array.from(entries.keys())) endRequest(id, 'esc');
  for (const w of settledWrappers()) restoreWrapper(w);
  removeEscListener();
  // Nothing is left for the hint's Undo to put back.
  dismissUndoHint?.();
  dismissUndoHint = null;
}

/** The extension context died: unhook the page and put back anything still waiting on a worker that is gone. */
export function teardownInline(): void {
  for (const [id, e] of entries) {
    clearTimeout(e.stuckTimerId);
    e.wrapper.replaceWith(e.original.cloneNode(true));
    entries.delete(id);
  }
  removeEscListener();
}

export function inlineCount(): number {
  return entries.size;
}

function renderText(wrapper: HTMLSpanElement, text: string, lang?: string): void {
  wrapper.removeAttribute('data-ega-pending');
  markLang(wrapper, lang);
  while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);
  wrapper.textContent = text;
}

/** While the body is still empty (envelope-only chunks) the original keeps showing. */
function renderProgress(wrapper: HTMLSpanElement, text: string, lang: string | undefined): void {
  if (text.length > 0) renderText(wrapper, text, lang);
}

function truncateTitle(s: string): string {
  const limit = 400;
  return s.length <= limit ? s : s.slice(0, limit - 1) + '…';
}

// Esc is overloaded page-wide, so a settled revert needs intent: pointer over a wrapper, or a second Esc inside this window.
const DOUBLE_ESC_WINDOW_MS = 1000;
let lastEscAt = 0;
let pointerOverWrapper = false;

function onDocMouseOver(ev: MouseEvent): void {
  const t = ev.target;
  // Page translate marks its blocks with data-ega-replaced too; Esc there is not ours to act on.
  pointerOverWrapper =
    t instanceof Element && t.closest('[data-ega-replaced][data-ega-original]') !== null;
}

/** Ega UI that acts on Esc itself. On the bubble or a pill, Esc still counts toward the restore. */
const ESC_OWNERS =
  '.ega-toast, .ega-draggable-panel, .bubble-menu, .ega-batch-progress [role="menu"], [data-ega-batch-more][aria-expanded="true"]';

/** The picker marks the page; multi-select shows its toolbar. Read off the DOM, so this chunk loads neither module. */
function aModeOwnsEsc(): boolean {
  return (
    document.documentElement.hasAttribute('data-ega-picking') ||
    peekContainer()?.querySelector('[data-ega-ms-wrap]') != null
  );
}

function onDocKeyDown(ev: KeyboardEvent): void {
  if (ev.key !== 'Escape') return;
  // This capture listener sees the Esc first, but the picker, multi-select, the toast and the tooltip own it.
  if (
    aModeOwnsEsc() ||
    ev.composedPath().some((n) => n instanceof Element && n.matches(ESC_OWNERS))
  )
    return;
  // An in-flight translate: Esc is a cancel, restore at once.
  if (entries.size > 0) {
    restoreAllInline();
    return;
  }
  const now = Date.now();
  const confirmed = pointerOverWrapper || now - lastEscAt <= DOUBLE_ESC_WINDOW_MS;
  lastEscAt = now;
  if (confirmed) restoreAllInline();
}

function ensureEscListener(): void {
  if (escListenerActive) return;
  document.addEventListener('keydown', onDocKeyDown, true);
  document.addEventListener('mouseover', onDocMouseOver, true);
  escListenerActive = true;
}

function removeEscListener(): void {
  if (!escListenerActive) return;
  document.removeEventListener('keydown', onDocKeyDown, true);
  document.removeEventListener('mouseover', onDocMouseOver, true);
  escListenerActive = false;
  lastEscAt = 0;
  pointerOverWrapper = false;
}

setRenderer('inline', {
  append: appendInlineDelta,
  finish: finishInline,
  error: errorInline,
  dispose: restoreInline,
});
