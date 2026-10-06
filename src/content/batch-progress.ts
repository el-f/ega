import { debugCatch } from '@/shared/logger';
import { mount, unmount } from 'svelte';
import BatchProgress from './BatchProgress.svelte';
import progressCss from './batch-progress.css?inline';
import { ensureShadowSheet, getContainer, onShadowHostRemount } from './shadowHost';
import type { PageProgress } from './page-translate-v2/progress';
import type { SettingsTab } from '@/shared/settings-tabs';

// The page-translate pill sits in the bottom bar slot. Unlike a toast it has no lifetime: the session dismisses it.

interface ActiveProgress {
  handle: ReturnType<typeof mount<Record<string, never>, PillExports>>;
  anchor: HTMLDivElement;
  /** The last page element focus came into the pill from; null until one does. */
  focusReturn: HTMLElement | null;
  tab: SettingsTab;
}

interface PillExports {
  set: (p: PageProgress) => void;
  setLive: (text: string) => void;
}

const HEIGHT_VAR = '--ega-batch-progress-h';

let active: ActiveProgress | null = null;
let closeHandler: (() => void) | null = null;
let undoHandler: (() => void) | null = null;
let retryFailedHandler: (() => void) | null = null;
let toggleHandler: ((showOriginal: boolean) => void) | null = null;

export interface BatchProgressHandle {
  /** One snapshot of the session; the pill derives its words and buttons from it. */
  update(p: PageProgress): void;
  /** Swap the polite announcement without remounting. */
  setLiveMessage(text: string): void;
  setOnClose(handler: () => void): void;
  setOnUndoAll(handler: () => void): void;
  setOnRetryFailed(handler: () => void): void;
  setOnToggleOriginal(handler: (showOriginal: boolean) => void): void;
  dismiss(): void;
}

/** The pill control that has focus; the shadow root tracks it, `document` only sees the host. */
function focusedIn(anchor: HTMLElement): HTMLElement | null {
  const el = (anchor.getRootNode() as Document | ShadowRoot).activeElement;
  return el instanceof HTMLElement && anchor.contains(el) ? el : null;
}

/** The pill grows a row when its text wraps or Error details opens, and a toast must clear all of it. */
function measure(): void {
  if (!active) return;
  const pill = active.anchor.firstElementChild as HTMLElement | null;
  active.anchor.parentElement?.style.setProperty(HEIGHT_VAR, `${pill?.offsetHeight ?? 0}px`);
}

function tearDown(): void {
  if (!active) return;
  const hadFocus = focusedIn(active.anchor) !== null;
  const focusReturn = active.focusReturn;
  try {
    void unmount(active.handle);
  } catch (e) {
    debugCatch(e, 'content.batch-progress.unmount');
  }
  active.anchor.parentElement?.style.removeProperty(HEIGHT_VAR);
  active.anchor.remove();
  active = null;
  closeHandler = null;
  undoHandler = null;
  retryFailedHandler = null;
  toggleHandler = null;
  // Remove translation and Close bar take the pressed button away; focus goes back to where it came from.
  if (hadFocus && focusReturn?.isConnected) focusReturn.focus({ preventScroll: true });
}

function openSettings(tab: SettingsTab): void {
  void chrome.runtime
    .sendMessage({ kind: 'ui:open-options', tab })
    .catch((e: unknown) => debugCatch(e, 'content.batch-progress.openSettings'));
}

export function showBatchProgress(
  total: number,
  onStop: () => void,
  liveMessage = 'Translating the page.',
): BatchProgressHandle {
  tearDown();
  ensureShadowSheet('ega-batch-progress-styles', progressCss);
  const anchor = document.createElement('div');
  anchor.setAttribute('data-ega-batch-progress-wrap', '');
  getContainer().appendChild(anchor);
  anchor.addEventListener('focusin', (e) => {
    if (active?.anchor !== anchor) return;
    const from = e.relatedTarget;
    // A window refocus has no relatedTarget; a shadow host (focus from another shadow tree) is kept.
    if (!(from instanceof HTMLElement) || !from.isConnected || anchor.contains(from)) return;
    active.focusReturn = from;
  });

  const handle = mount(BatchProgress, {
    target: anchor,
    props: {
      initial: {
        done: 0,
        failed: 0,
        total,
        waiting: 0,
        inFlight: 0,
        queued: total,
        skipped: 0,
        settled: false,
      },
      liveMessage,
      onStop,
      onRemove: () => undoHandler?.(),
      onRetryFailed: () => retryFailedHandler?.(),
      onOpenSettings: () => {
        if (active) openSettings(active.tab);
      },
      onToggleOriginal: (showOriginal: boolean) => toggleHandler?.(showOriginal),
      onClose: () => closeHandler?.(),
    },
  }) as ActiveProgress['handle'];
  const mine: ActiveProgress = { handle, anchor, focusReturn: null, tab: 'backends' };
  active = mine;
  measure();

  return {
    update(p: PageProgress): void {
      if (active !== mine) return;
      if (p.failure) mine.tab = p.failure.tab;
      mine.handle.set(p);
      queueMicrotask(measure);
    },
    setLiveMessage(text: string): void {
      if (active === mine) mine.handle.setLive(text);
    },
    setOnClose(handler: () => void): void {
      if (active === mine) closeHandler = handler;
    },
    setOnUndoAll(handler: () => void): void {
      if (active === mine) undoHandler = handler;
    },
    setOnRetryFailed(handler: () => void): void {
      if (active === mine) retryFailedHandler = handler;
    },
    setOnToggleOriginal(handler: (showOriginal: boolean) => void): void {
      if (active === mine) toggleHandler = handler;
    },
    dismiss(): void {
      if (active === mine) tearDown();
    },
  };
}

/** Test-only: surface whether a batch progress pill is currently mounted. */
export function isBatchProgressActive(): boolean {
  return active !== null;
}

onShadowHostRemount(tearDown);
