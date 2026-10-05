import { SETTINGS_REGISTRY } from '@/shared/settings-registry';
import type { AdvancedSubTab } from '@/shared/settings-spec';

/** Entry-id payload handed from the settings search / command palette to the tab that owns the control. */
const TARGET_KEY = 'ega-settings-target';

/** Same-tab jumps do not remount the pane, so it needs an explicit re-resolve signal. */
export const DEEP_LINK_EVENT = 'ega:options:deeplink';

export function setPendingDeepLink(entryId: string): void {
  try {
    sessionStorage.setItem(TARGET_KEY, entryId);
  } catch {
    // sandboxed sessionStorage throws; the jump still switches tab
  }
}

export function readPendingDeepLink(): string | null {
  try {
    return sessionStorage.getItem(TARGET_KEY);
  } catch {
    return null;
  }
}

export function clearPendingDeepLink(): void {
  try {
    sessionStorage.removeItem(TARGET_KEY);
  } catch {
    // Sandboxed sessionStorage throws; the value is only a convenience.
  }
}

export function advancedSubTabFor(entryId: string): AdvancedSubTab | null {
  const entry = SETTINGS_REGISTRY.find((e) => e.id === entryId);
  if (entry?.tab !== 'advanced') return null;
  return entry.subTab ?? 'diagnostics';
}

/** CSS `scroll-behavior` does not reach scrollIntoView, so the query is read here. */
export function scrollBehavior(): 'auto' | 'smooth' {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function reveal(el: HTMLElement): void {
  // A target inside a collapsed card or disclosure cannot scroll into view: open every one around it.
  for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null)
    d.open = true;
  // tabindex=-1 makes a section or div focusable; preventScroll leaves scrollIntoView in charge.
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  try {
    el.focus({ preventScroll: true });
  } catch {
    // focus on an inert node is a no-op
  }
  el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  el.setAttribute('data-flash', 'true');
  setTimeout(() => el.removeAttribute('data-flash'), 800);
}

export interface RetryOptions {
  readonly attempts?: number;
  readonly intervalMs?: number;
}

/** Runs onFound once selector matches, retrying while a lazy tab mounts; onCancel runs when the retries run out. */
export function whenPresent(
  selector: string,
  onFound: (el: HTMLElement) => void,
  opts: RetryOptions & { onCancel?: () => void; isCurrent?: () => boolean } = {},
): void {
  let left = opts.attempts ?? 40;
  const intervalMs = opts.intervalMs ?? 16;
  const tick = (): void => {
    if (opts.isCurrent && !opts.isCurrent()) return;
    const el = document.querySelector(selector);
    if (el instanceof HTMLElement) {
      onFound(el);
      return;
    }
    if (--left <= 0) {
      opts.onCancel?.();
      return;
    }
    setTimeout(tick, intervalMs);
  };
  // Never synchronous: a still-open dialog's focus scope pulls focus back off the anchor on unmount.
  setTimeout(tick, intervalMs);
}

/** Reveals the pending target once its tab paints it, and clears the target either way so a stale id cannot fire later. */
export function revealPendingSetting(opts: RetryOptions = {}): void {
  const entryId = readPendingDeepLink();
  if (!entryId) return;
  const selector = SETTINGS_REGISTRY.find((e) => e.id === entryId)?.targetSelector;
  if (!selector) {
    clearPendingDeepLink();
    return;
  }
  whenPresent(
    selector,
    (el) => {
      clearPendingDeepLink();
      reveal(el);
    },
    {
      ...opts,
      onCancel: clearPendingDeepLink,
      isCurrent: () => readPendingDeepLink() === entryId,
    },
  );
}
