import { debugCatch } from '@/shared/logger';
import { mount, unmount } from 'svelte';
import BatchProgress from './BatchProgress.svelte';
import progressCss from './batch-progress.css?inline';
import { ensureShadowSheet, getContainer, onShadowHostRemount } from './shadowHost';

// Progress toast for whole-page translate. Unlike showToast it has no TTL — the runner dismisses it.

interface ActiveProgress {
  handle: ReturnType<typeof mount>;
  anchor: HTMLDivElement;
  total: number;
  onCancel: () => void;
  done: number;
  settled: boolean;
  complete: boolean;
  failed: number;
  /** Set when every failure shares one error code. */
  failedLabel: string | undefined;
  /** Areas Stop dropped; `total` counts only the kept ones. */
  stopped: number;
  showingOriginal: boolean;
  /** Date.now of the last Stop press; Stop turns into Show original under the pointer. */
  stopPressedAt: number;
  /** What had focus before it last moved into the pill; null when nothing did. */
  focusReturn: HTMLElement | null;
}

const HEIGHT_VAR = '--ega-batch-progress-h';
/** The second click of a double-click on Stop lands on Show original and must not revert the page. */
const TOGGLE_GUARD_MS = 400;

let active: ActiveProgress | null = null;
let closeHandler: (() => void) | null = null;
let undoHandler: (() => void) | null = null;
let retryFailedHandler: (() => void) | null = null;
let toggleHandler: ((showOriginal: boolean) => void) | null = null;

export interface BatchProgressHandle {
  update(done: number): void;
  /** Leave the active "Translating…" state. Lazy dispatch goes idle with done < total, so `complete` is true only when every block finished. */
  settle(opts: {
    done: number;
    total: number;
    complete: boolean;
    failed: number;
    failedLabel?: string;
    stopped?: number;
  }): void;
  /** Swap the aria-live text without remounting. */
  setLiveMessage(text: string): void;
  setOnClose(handler: () => void): void;
  setOnUndoAll(handler: () => void): void;
  setOnRetryFailed(handler: () => void): void;
  /** Once settled, the action button toggles Show original ⇄ Show translation through this. */
  setOnToggleOriginal(handler: (showOriginal: boolean) => void): void;
  dismiss(): void;
}

function areas(n: number): string {
  return n === 1 ? 'area' : 'areas';
}

function labelText(a: ActiveProgress): string {
  if (!a.settled) return `Translating ${a.done} of ${a.total} ${areas(a.total)}…`;
  if (a.complete) return 'Page translated';
  // `done` counts blocks that reached a terminal state, so it must not read as "translated" when some failed.
  if (a.stopped > 0) {
    const picked = a.total + a.stopped;
    const kept = `Stopped · ${a.done - a.failed} of ${picked} ${areas(picked)} translated`;
    return a.failed > 0 ? `${kept} · ${a.failed} failed` : kept;
  }
  const count =
    a.failed === a.total
      ? a.total === 1
        ? '1 area failed'
        : `All ${a.total} areas failed`
      : `${a.failed} of ${a.total} ${areas(a.total)} failed`;
  return a.failedLabel ? `${count}: ${a.failedLabel}` : count;
}

/** The pill control that has focus; the shadow root tracks it, `document` only sees the host. */
function focusedIn(anchor: HTMLElement): HTMLElement | null {
  const el = (anchor.getRootNode() as Document | ShadowRoot).activeElement;
  return el instanceof HTMLElement && anchor.contains(el) ? el : null;
}

function patchVisible(): void {
  if (!active) return;
  const focused = focusedIn(active.anchor);
  const label = active.anchor.querySelector<HTMLElement>('[data-ega-batch-label]');
  if (label) label.textContent = labelText(active);
  // Once settled the button no longer cancels anything — it toggles the view.
  const cancel = active.anchor.querySelector<HTMLElement>('[data-ega-batch-cancel]');
  if (cancel) {
    const settledLabel = active.showingOriginal ? 'Show translation' : 'Show original';
    cancel.textContent = active.settled ? settledLabel : 'Stop';
    cancel.setAttribute(
      'aria-label',
      active.settled
        ? active.showingOriginal
          ? 'Show translation on the page'
          : 'Show original page text'
        : 'Stop translating and keep the finished areas',
    );
  }
  // With nothing translated there is no other view to switch to.
  if (cancel) cancel.hidden = active.settled && active.done - active.failed <= 0;
  const retry = active.anchor.querySelector<HTMLElement>('.retry-failed');
  if (retry) retry.hidden = !(active.settled && active.failed > 0);
  const bar = active.anchor.querySelector<HTMLElement>('[data-ega-batch-bar]');
  const fill = active.anchor.querySelector<HTMLElement>('[data-ega-batch-bar-fill]');
  // A stopped bar measures what was kept against everything picked, so it matches the label.
  const stopped = active.settled && active.stopped > 0;
  const max = stopped ? active.total + active.stopped : active.total;
  const now = stopped ? active.done - active.failed : active.done;
  const pct = max > 0 ? Math.min(100, (now / max) * 100) : 0;
  if (fill) {
    fill.style.width = `${pct}%`;
    if (stopped) fill.dataset['tone'] = 'stopped';
    else if (active.settled && active.failed > 0) fill.dataset['tone'] = 'failed';
    else delete fill.dataset['tone'];
  }
  if (bar) {
    bar.setAttribute('aria-valuemax', String(max));
    bar.setAttribute('aria-valuenow', String(now));
  }
  // A pressed button that just hid itself would drop focus to the page; the next live control takes it.
  if (focused?.hidden) {
    const next = [cancel, retry, active.anchor.querySelector<HTMLElement>('.undo')].find(
      (b) => b && !b.hidden,
    );
    next?.focus({ preventScroll: true });
  }
  // The pill wraps to more rows as its buttons change, and a toast must clear all of them.
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
  // Undo all and Hide remove the button that was pressed; focus goes back to where it came from.
  if (hadFocus && focusReturn?.isConnected) focusReturn.focus({ preventScroll: true });
}

/** Cancel while running; after settle the same button flips the page view instead. */
function onActionClick(outerCancel: () => void): void {
  if (!active) return;
  if (!active.settled || !toggleHandler) {
    active.stopPressedAt = Date.now();
    outerCancel();
    return;
  }
  if (Date.now() - active.stopPressedAt < TOGGLE_GUARD_MS) return;
  active.showingOriginal = !active.showingOriginal;
  toggleHandler(active.showingOriginal);
  patchVisible();
}

export function showBatchProgress(
  total: number,
  onCancel: () => void,
  liveMessage = `Translating ${total} ${total === 1 ? 'area' : 'areas'}…`,
): BatchProgressHandle {
  tearDown();
  ensureShadowSheet('ega-batch-progress-styles', progressCss);
  const anchor = document.createElement('div');
  anchor.setAttribute('data-ega-batch-progress-wrap', '');
  getContainer().appendChild(anchor);
  anchor.addEventListener('focusin', (e) => {
    if (active?.anchor !== anchor) return;
    const from = e.relatedTarget;
    if (from instanceof Node && anchor.contains(from)) return;
    active.focusReturn = from instanceof HTMLElement ? from : null;
  });

  const handle = mount(BatchProgress, {
    target: anchor,
    props: {
      done: 0,
      total,
      liveMessage,
      onCancel: () => onActionClick(onCancel),
      onUndo: () => undoHandler?.(),
      onRetryFailed: () => retryFailedHandler?.(),
      onClose: () => closeHandler?.(),
    },
  });
  active = {
    handle,
    anchor,
    total,
    onCancel,
    done: 0,
    settled: false,
    complete: false,
    failed: 0,
    failedLabel: undefined,
    stopped: 0,
    showingOriginal: false,
    stopPressedAt: 0,
    focusReturn: null,
  };

  return {
    update(done: number): void {
      if (!active) return;
      // A retry un-terminals a block, so a settled pill must go back to reporting progress.
      if (active.settled) {
        if (done >= active.total) return;
        active.settled = false;
        active.complete = false;
      }
      // Patching textContent avoids a Svelte remount per resolved segment.
      active.done = done;
      patchVisible();
    },
    settle(opts: {
      done: number;
      total: number;
      complete: boolean;
      failed: number;
      failedLabel?: string;
      stopped?: number;
    }): void {
      if (!active) return;
      active.done = opts.done;
      active.total = opts.total;
      active.settled = true;
      active.complete = opts.complete;
      active.failed = opts.failed;
      active.failedLabel = opts.failedLabel;
      active.stopped = opts.stopped ?? 0;
      patchVisible();
    },
    setLiveMessage(text: string): void {
      if (!active) return;
      const region = active.anchor.querySelector<HTMLElement>('[data-ega-batch-live]');
      if (region) region.textContent = text;
    },
    setOnClose(handler: () => void): void {
      if (!active) return;
      // Revealing beats remounting: a remount replays the slide-up and shifts the pill.
      closeHandler = handler;
      const btn = active.anchor.querySelector<HTMLElement>('[data-ega-batch-close]');
      if (btn) btn.dataset['ready'] = 'true';
    },
    setOnUndoAll(handler: () => void): void {
      if (!active) return;
      undoHandler = handler;
    },
    setOnRetryFailed(handler: () => void): void {
      if (!active) return;
      retryFailedHandler = handler;
    },
    setOnToggleOriginal(handler: (showOriginal: boolean) => void): void {
      if (!active) return;
      toggleHandler = handler;
    },
    dismiss(): void {
      tearDown();
    },
  };
}

/** Test-only: surface whether a batch progress toast is currently mounted. */
export function isBatchProgressActive(): boolean {
  return active !== null;
}

onShadowHostRemount(tearDown);
