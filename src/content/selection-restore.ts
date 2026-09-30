// Chrome clears the selection a frame AFTER visibilitychange, so restore during a grace window, not once.

import { getShadowHostElement } from './shadowHost';

const GRACE_MS = 500;
const TTL_MS = 5 * 60 * 1000;
// A collapse this soon after a click or keypress came from the user, not from the browser.
const USER_COLLAPSE_WINDOW_MS = 300;

// Exported only so tests can reset it between cases.
export const selectionRestoreInternal: {
  cached: { range: Range; ts: number } | null;
  graceUntil: number;
  installed: boolean;
  lastUserInputAt: number;
} = { cached: null, graceUntil: 0, installed: false, lastUserInputAt: 0 };

// Ega must not touch the page's selection on a site the user turned it off for.
let isSiteOff: () => boolean = () => false;

function cacheCurrentSelection(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const r = sel.getRangeAt(0).cloneRange();
  if (r.toString().trim().length === 0) return;
  selectionRestoreInternal.cached = { range: r, ts: Date.now() };
}

function inDom(r: Range): boolean {
  return document.contains(r.startContainer) && document.contains(r.endContainer);
}

function tryRestore(): void {
  const c = selectionRestoreInternal.cached;
  if (!c) return;
  if (Date.now() - c.ts > TTL_MS) {
    selectionRestoreInternal.cached = null;
    return;
  }
  const sel = window.getSelection();
  if (!sel) return;
  // Don't clobber a fresh non-empty user selection.
  if (sel.rangeCount > 0 && !sel.isCollapsed) {
    // User has a real selection — update the cache to THAT one instead.
    cacheCurrentSelection();
    return;
  }
  if (!inDom(c.range)) {
    selectionRestoreInternal.cached = null;
    return;
  }
  try {
    sel.removeAllRanges();
    sel.addRange(c.range);
  } catch {
    selectionRestoreInternal.cached = null;
  }
}

function purgeStaleCache(): void {
  const c = selectionRestoreInternal.cached;
  if (!c) return;
  if (Date.now() - c.ts > TTL_MS || !inDom(c.range)) selectionRestoreInternal.cached = null;
}

/** Events inside the ega shadow host retarget to the host element, so clicking our own UI is not a deselect. */
export function onUserInput(ev: Event): void {
  const t = ev.target;
  if (t instanceof Node && getShadowHostElement()?.contains(t) === true) return;
  selectionRestoreInternal.lastUserInputAt = Date.now();
}

export function onSelectionChange(): void {
  if (isSiteOff()) return;
  purgeStaleCache();
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    // Real non-empty selection — cache it.
    cacheCurrentSelection();
    return;
  }
  // A deliberate deselect must not come back on the next window focus.
  if (Date.now() - selectionRestoreInternal.lastUserInputAt <= USER_COLLAPSE_WINDOW_MS) {
    selectionRestoreInternal.cached = null;
    return;
  }
  // Outside the grace window the user's collapse stands.
  if (Date.now() < selectionRestoreInternal.graceUntil) {
    tryRestore();
  }
}

export function onVisibilityOrFocus(): void {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  if (isSiteOff()) return;
  selectionRestoreInternal.graceUntil = Date.now() + GRACE_MS;
  // Chrome may have cleared the Selection before this event landed.
  tryRestore();
}

/** `siteOff` must answer synchronously; a cold settings cache should answer false. */
export function installSelectionRestore(siteOff: () => boolean = () => false): void {
  isSiteOff = siteOff;
  if (selectionRestoreInternal.installed) return;
  selectionRestoreInternal.installed = true;
  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('visibilitychange', onVisibilityOrFocus);
  window.addEventListener('focus', onVisibilityOrFocus);
  document.addEventListener('mousedown', onUserInput, true);
  document.addEventListener('keydown', onUserInput, true);
}

export function uninstallSelectionRestore(): void {
  selectionRestoreInternal.installed = false;
  document.removeEventListener('selectionchange', onSelectionChange);
  document.removeEventListener('visibilitychange', onVisibilityOrFocus);
  window.removeEventListener('focus', onVisibilityOrFocus);
  document.removeEventListener('mousedown', onUserInput, true);
  document.removeEventListener('keydown', onUserInput, true);
  // The cached clone strong-references its start and end containers.
  selectionRestoreInternal.cached = null;
}
