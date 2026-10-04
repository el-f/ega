import { debugCatch } from '@/shared/logger';
import { mount, unmount } from 'svelte';
import BatchProgress from './BatchProgress.svelte';
import progressCss from './batch-progress.css?inline';
import { getContainer, getShadowRoot, onShadowHostRemount } from './shadowHost';

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
}

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
    return `Stopped · ${a.done - a.failed} of ${a.total + a.stopped} ${areas(a.total + a.stopped)} translated`;
  }
  const count =
    a.failed === a.total
      ? a.total === 1
        ? '1 area failed'
        : `All ${a.total} areas failed`
      : `${a.failed} of ${a.total} ${areas(a.total)} failed`;
  return a.failedLabel ? `${count}: ${a.failedLabel}` : count;
}

function patchVisible(): void {
  if (!active) return;
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
  const retry = active.anchor.querySelector<HTMLElement>('.retry-failed');
  if (retry) retry.hidden = !(active.settled && active.failed > 0);
  const bar = active.anchor.querySelector<HTMLElement>('[data-ega-batch-bar]');
  const fill = active.anchor.querySelector<HTMLElement>('[data-ega-batch-bar-fill]');
  const pct = active.total > 0 ? Math.min(100, (active.done / active.total) * 100) : 0;
  if (fill) {
    fill.style.width = `${pct}%`;
    if (active.settled && active.failed > 0) fill.dataset['tone'] = 'failed';
    else delete fill.dataset['tone'];
  }
  if (bar) {
    bar.setAttribute('aria-valuemax', String(active.total));
    bar.setAttribute('aria-valuenow', String(active.done));
  }
}

function tearDown(): void {
  if (!active) return;
  try {
    void unmount(active.handle);
  } catch (e) {
    debugCatch(e, 'content.batch-progress.unmount');
  }
  active.anchor.remove();
  active = null;
  closeHandler = null;
  undoHandler = null;
  retryFailedHandler = null;
  toggleHandler = null;
}

/** Cancel while running; after settle the same button flips the page view instead. */
function onActionClick(outerCancel: () => void): void {
  if (!active) return;
  if (!active.settled || !toggleHandler) {
    outerCancel();
    return;
  }
  active.showingOriginal = !active.showingOriginal;
  toggleHandler(active.showingOriginal);
  patchVisible();
}

const STYLE_ID = 'ega-batch-progress-styles';

function ensureProgressStyles(): void {
  const root = getShadowRoot();
  if (root.querySelector(`#${STYLE_ID}`)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = progressCss;
  root.appendChild(style);
}

export function showBatchProgress(
  total: number,
  onCancel: () => void,
  liveMessage = `Translating ${total} ${total === 1 ? 'area' : 'areas'}…`,
): BatchProgressHandle {
  tearDown();
  ensureProgressStyles();
  const anchor = document.createElement('div');
  anchor.setAttribute('data-ega-batch-progress-wrap', '');
  getContainer().appendChild(anchor);

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
