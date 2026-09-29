import type { ErrCode, Settings, TranslationChunk } from '@/shared/types';
import { PageStore, type RenderMode } from './store';
import {
  mountBilingual,
  mountInplace,
  appendDelta,
  finish,
  mountError,
  setGlobalOriginalView,
  type RenderHandle,
} from './renderer';
import {
  enterMultiSelect,
  exitMultiSelect,
  isMultiSelectActive,
  type SelectedBlock,
} from './multi-select';
import { DEFAULT_BATCH_CONCURRENCY, DEFAULT_TRANSLATE_TIMEOUT_MS } from '@/shared/constants';
import { isRetryable } from '@/shared/error-policy';
import { errCodeLabel } from '@/shared/err-labels';
import {
  isContextInvalidatedError,
  CONTEXT_INVALIDATED_MESSAGE,
  SEND_FAILED_MESSAGE,
} from '../context-guard';
import { debugCatch } from '@/shared/logger';
import { patchSettings } from '@/shared/settings-bus';
import { uuid } from '@/shared/uuid';
import { setRenderer } from '../request-state';
import { showFixToast } from '../error-fix-toast';

// A free-tier backend rate-limits a many-block batch fast, so transient failures retry with jittered exponential backoff.
const PAGE_RETRY_MAX_ATTEMPTS = 3;
export function pageBackoffMs(attemptsMade: number): number {
  return Math.min(8000, 800 * 2 ** (attemptsMade - 1));
}
// Destagger the concurrent burst so retries don't thunder back in lockstep.
export function pageRetryJitterMs(): number {
  return Math.floor(globalThis.Math.random() * 400);
}

export function pageSettleMessage(done: number, total: number, failed: number): string {
  if (failed === 0) return 'Page translated.';
  return `Translated ${done - failed} of ${total}. ${failed} failed.`;
}

export interface ProgressHandle {
  update(done: number): void;
  settle?(opts: {
    done: number;
    total: number;
    complete: boolean;
    failed: number;
    failedLabel?: string;
  }): void;
  setLiveMessage(text: string): void;
  setOnClose(handler: () => void): void;
  setOnToggleOriginal?(handler: (showOriginal: boolean) => void): void;
  dismiss(): void;
}

export interface PageV2Deps {
  getSettings: () => Promise<Settings>;
  /** Optional per-block lang detector; the returned id is forwarded to
   *  dispatch so each block uses its own detected source language. */
  detectLang?: (text: string) => string | undefined;
  /** Send a translate:start for one block. The requestId is generated here so
   *  it can be registered before the message races back. */
  dispatch: (requestId: string, text: string, detectedLang?: string) => Promise<void>;
  /** Tell the content router "chunks for this requestId belong to page-v2". */
  onRegister: (requestId: string) => void;
  /** Drop the page-v2 ownership for a requestId (cancel / done). */
  onUnregister: (requestId: string) => void;
  /** Send translate:cancel to the router for a still-in-flight requestId so it
   *  stops streaming + spending tokens. Called on batch cancel / nav. */
  cancelRequest?: (requestId: string) => void;
  mountProgress?: (total: number, onCancel: () => void) => ProgressHandle;
}

interface Block {
  id: string;
  element: HTMLElement;
  text: string;
  detectedLang?: string;
}

interface Session {
  store: PageStore;
  progress: ProgressHandle | null;
  registered: Set<string>;
  deps: PageV2Deps;
  mode: RenderMode;
  concurrency: number;
  stallMs: number;
  total: number;
  pending: Block[];
  inFlight: Set<string>;
  terminal: Set<string>;
  failed: Map<string, ErrCode>;
  retrying: Set<string>;
  attempts: Map<string, number>;
  handles: Map<string, RenderHandle>;
  stallTimers: Map<string, ReturnType<typeof setTimeout>>;
  backoffTimers: Set<ReturnType<typeof setTimeout>>;
  settledOnce: boolean;
  /** A page whose blocks all fail at once shows one toast, not one per block. */
  fixToastShown: boolean;
  showingGlobalOriginal: boolean;
  checkUrlChange: () => void;
}

function isSettled(sess: Session): boolean {
  return sess.terminal.size >= sess.total;
}

let active: Session | null = null;
let entering = false;

export function isPageV2Active(): boolean {
  return active !== null;
}

/** Opens translate-areas mode; the user picks blocks and Enter runs them. A second call while picking exits. */
export async function runPageTranslateV2(deps: PageV2Deps): Promise<void> {
  if (entering) return;
  if (active) {
    // A settled batch keeps its pill open; a fresh translate closes it and lets the user pick more.
    if (!isSettled(active)) return;
    closeSession(active);
  }
  if (isMultiSelectActive()) {
    exitMultiSelect();
    return;
  }
  entering = true;
  try {
    const s = await deps.getSettings();
    const initialMode: RenderMode = s.pageTranslateMode === 'bilingual' ? 'bilingual' : 'inplace';
    enterMultiSelect({
      initialMode,
      onModeChange: persistMode,
      onFire: (blocks, mode) => {
        void startSession(deps, blocks, mode).catch((e) => debugCatch(e, 'content.pageV2.start'));
      },
    });
  } finally {
    entering = false;
  }
}

function persistMode(mode: RenderMode): void {
  try {
    void patchSettings({ pageTranslateMode: mode }).then((ack) => {
      if (!ack.ok) debugCatch(new Error(ack.reason), 'content.pageV2.persistMode');
    });
  } catch (e) {
    debugCatch(e, 'content.pageV2.persistMode');
  }
}

async function startSession(
  deps: PageV2Deps,
  selected: SelectedBlock[],
  mode: RenderMode,
): Promise<void> {
  if (active) return;
  const s = await deps.getSettings();
  const concurrency = Math.max(
    1,
    typeof s.batchConcurrency === 'number' ? s.batchConcurrency : DEFAULT_BATCH_CONCURRENCY,
  );
  const timeoutMs =
    typeof s.translateTimeoutMs === 'number' ? s.translateTimeoutMs : DEFAULT_TRANSLATE_TIMEOUT_MS;
  const blocks: Block[] = selected.map((b) => {
    const detectedLang = deps.detectLang?.(b.text);
    return {
      id: b.id,
      element: b.element,
      text: b.text,
      ...(detectedLang !== undefined ? { detectedLang } : {}),
    };
  });

  const progress =
    deps.mountProgress?.(blocks.length, () => {
      void cancelPageTranslateV2();
    }) ?? null;

  const startUrl = location.pathname + location.search;
  const checkUrlChange = (): void => {
    if (location.pathname + location.search !== startUrl) {
      queueMicrotask(() => {
        void cancelPageTranslateV2();
      });
    }
  };
  // popstate only: a `history.pushState` patch made here lives in the isolated world, so the page's own router never runs it.
  window.addEventListener('popstate', checkUrlChange);

  active = {
    store: new PageStore(),
    progress,
    registered: new Set(),
    deps,
    mode,
    concurrency,
    // Sits above the router's own ceiling, so it only fires when the SW dies without a terminal chunk.
    stallMs: timeoutMs + 60_000,
    total: blocks.length,
    pending: [...blocks],
    inFlight: new Set(),
    terminal: new Set(),
    failed: new Map(),
    retrying: new Set(),
    attempts: new Map(),
    handles: new Map(),
    stallTimers: new Map(),
    backoffTimers: new Set(),
    settledOnce: false,
    fixToastShown: false,
    showingGlobalOriginal: false,
    checkUrlChange,
  };
  pump();
}

/** Dispatch queued blocks while worker slots are free. Slots free on terminal chunks, so this re-runs from markTerminal. */
function pump(): void {
  const sess = active;
  if (!sess) return;
  while (sess.inFlight.size < sess.concurrency && sess.pending.length > 0) {
    const block = sess.pending.shift();
    if (!block) break;
    sess.inFlight.add(block.id);
    void dispatchBlock(sess, block);
  }
}

async function dispatchBlock(sess: Session, block: Block): Promise<void> {
  sess.attempts.set(block.id, (sess.attempts.get(block.id) ?? 0) + 1);
  const handle =
    sess.mode === 'bilingual'
      ? mountBilingual({ id: block.id, element: block.element, originalText: block.text })
      : mountInplace({ id: block.id, element: block.element, originalText: block.text });
  sess.handles.set(block.id, handle);
  // store.set below clears the old requestId, so unbind first or a late chunk still routes through the stale mapping.
  sess.store.unbindRequest(block.id);
  sess.store.set({
    id: block.id,
    element: block.element,
    mode: sess.mode,
    text: block.text,
    ...(block.detectedLang ? { detectedLang: block.detectedLang } : {}),
    revert: handle.revert,
    showOriginal: handle.showOriginal,
    showTranslation: handle.showTranslation,
  });

  const requestId = uuid();
  sess.deps.onRegister(requestId);
  sess.registered.add(requestId);
  try {
    await sess.deps.dispatch(requestId, block.text, block.detectedLang);
  } catch (e) {
    // A failed dispatch must unregister, or cancel iterates a ghost request the router never received.
    sess.deps.onUnregister(requestId);
    sess.registered.delete(requestId);
    if (sess !== active) return;
    const err = {
      code: 'NETWORK' as const,
      message: isContextInvalidatedError(e) ? CONTEXT_INVALIDATED_MESSAGE : SEND_FAILED_MESSAGE,
    };
    mountError(handle, err, { onRetry: () => retryBlock(block.id) });
    failBlock(sess, block.id, err);
    return;
  }
  if (sess !== active) return;
  sess.store.bindRequest(block.id, requestId);
  if (sess.terminal.has(block.id)) return;
  armStall(sess, block.id);
}

function failBlock(sess: Session, blockId: string, err: { code: ErrCode; message: string }): void {
  sess.failed.set(blockId, err.code);
  if (!sess.fixToastShown) sess.fixToastShown = showFixToast(err);
  markTerminal(sess, blockId);
}

function markTerminal(sess: Session, blockId: string): void {
  if (sess.terminal.has(blockId)) return;
  sess.terminal.add(blockId);
  sess.inFlight.delete(blockId);
  sess.retrying.delete(blockId);
  clearStall(sess, blockId);
  // A block that settles after the pill's toggle must join the view the rest of the page is in.
  if (sess.showingGlobalOriginal) sess.store.get(blockId)?.showOriginal?.();
  sess.progress?.update(sess.terminal.size);
  maybeSettle(sess);
  pump();
}

function maybeSettle(sess: Session): void {
  if (sess.terminal.size < sess.total) return;
  const p = sess.progress;
  if (!p) return;
  const failed = sess.failed.size;
  const codes = new Set(sess.failed.values());
  const [onlyCode] = codes;
  p.settle?.({
    done: sess.total,
    total: sess.total,
    complete: failed === 0,
    failed,
    ...(codes.size === 1 && onlyCode !== undefined ? { failedLabel: errCodeLabel(onlyCode) } : {}),
  });
  p.setLiveMessage(pageSettleMessage(sess.total, sess.total, failed));
  if (sess.settledOnce) return;
  sess.settledOnce = true;
  p.setOnToggleOriginal?.((showOriginal) => {
    sess.showingGlobalOriginal = showOriginal;
    // Suspend the per-wrapper peek listeners, or a mouseleave flips single blocks back mid-toggle.
    setGlobalOriginalView(showOriginal);
    sess.store.forEach((entry) => {
      if (showOriginal) entry.showOriginal?.();
      else entry.showTranslation?.();
    });
    p.setLiveMessage(showOriginal ? 'Showing the original page.' : 'Showing the translation.');
  });
  p.setOnClose(() => {
    closeSession(sess);
  });
}

/** Dismiss the pill and let go of the session, keeping every translation on the page. */
function closeSession(sess: Session): void {
  sess.progress?.dismiss();
  if (active === sess) active = null;
  // Close keeps the translations, so leave the page on the translated view first.
  if (sess.showingGlobalOriginal) {
    sess.store.forEach((entry) => entry.showTranslation?.());
  }
  for (const [blockId, handle] of sess.handles) {
    // A manual retry un-terminals its block, so close can land on one still showing the placeholder.
    if (!sess.terminal.has(blockId)) {
      handle.revert();
      continue;
    }
    // Retry needs a live session; without the pill the button would do nothing.
    handle.target.querySelector('[data-ega-retry-block]')?.remove();
  }
  teardownSession(sess, false);
}

function armStall(sess: Session, blockId: string): void {
  clearStall(sess, blockId);
  sess.stallTimers.set(
    blockId,
    setTimeout(() => {
      sess.stallTimers.delete(blockId);
      if (sess !== active) return;
      onStall(sess, blockId);
    }, sess.stallMs),
  );
}

function keepStallAlive(sess: Session, blockId: string): void {
  if (sess.stallTimers.has(blockId)) armStall(sess, blockId);
}

function clearStall(sess: Session, blockId: string): void {
  const t = sess.stallTimers.get(blockId);
  if (t !== undefined) {
    clearTimeout(t);
    sess.stallTimers.delete(blockId);
  }
}

/** No terminal chunk ever arrived — settle the block so its worker slot frees. */
function onStall(sess: Session, blockId: string): void {
  if (sess.terminal.has(blockId)) return;
  const handle = sess.handles.get(blockId);
  const err = { code: 'TIMEOUT' as const, message: 'No reply in time. Try again.' };
  if (handle) mountError(handle, err, { onRetry: () => retryBlock(blockId) });
  failBlock(sess, blockId, err);
}

/** Re-mount + re-queue a block through a worker slot, so a burst of retries cannot bypass the concurrency cap. */
function redispatch(sess: Session, blockId: string): void {
  const entry = sess.store.get(blockId);
  if (!entry) return;
  const handle = sess.handles.get(blockId);
  if (handle) handle.revert();
  sess.handles.delete(blockId);
  sess.pending.push({
    id: entry.id,
    element: entry.element as HTMLElement,
    text: entry.text,
    ...(entry.detectedLang ? { detectedLang: entry.detectedLang } : {}),
  });
  pump();
}

function retryBlock(blockId: string): void {
  const sess = active;
  if (!sess) return;
  if (sess.retrying.has(blockId)) return;
  if (!sess.store.get(blockId)) return;
  sess.retrying.add(blockId);
  // A manual retry un-terminals the block and resets its backoff budget.
  sess.terminal.delete(blockId);
  sess.attempts.delete(blockId);
  sess.failed.delete(blockId);
  sess.progress?.update(sess.terminal.size);
  redispatch(sess, blockId);
}

/** Transient failure: wait out a backoff, then re-dispatch — no chip yet.
 *  A server Retry-After hint (429/529) is a floor on the delay; jitter rides on top. */
function scheduleBackoffRetry(sess: Session, blockId: string, retryAfterMs?: number): void {
  const made = sess.attempts.get(blockId) ?? 1;
  const delay = Math.max(pageBackoffMs(made), retryAfterMs ?? 0) + pageRetryJitterMs();
  const timer = setTimeout(() => {
    sess.backoffTimers.delete(timer);
    if (sess !== active) return;
    redispatch(sess, blockId);
  }, delay);
  sess.backoffTimers.add(timer);
}

export function routePageV2Chunk(chunk: TranslationChunk): void {
  const sess = active;
  if (!sess) return;
  onChunk(sess, chunk);
  if (chunk.type === 'done' || chunk.type === 'error') {
    sess.registered.delete(chunk.requestId);
    sess.deps.onUnregister(chunk.requestId);
  }
}

// The session reverts its own blocks on teardown, so ending a request needs no dispose here.
setRenderer('page-v2', {
  append: (requestId, text) => routePageV2Chunk({ type: 'delta', requestId, text }),
  finish: (requestId, meta) => routePageV2Chunk({ type: 'done', requestId, ...meta }),
  error: (requestId, err) => routePageV2Chunk({ type: 'error', requestId, ...err }),
});

function onChunk(sess: Session, chunk: TranslationChunk): void {
  const blockId = sess.store.blockIdForRequest(chunk.requestId);
  if (!blockId) return;
  const handle = sess.handles.get(blockId);
  if (!handle) return;
  if (chunk.type === 'delta') {
    keepStallAlive(sess, blockId);
    appendDelta(handle, chunk.text);
    return;
  }
  if (chunk.type === 'done') {
    finish(handle);
    markTerminal(sess, blockId);
    return;
  }
  const made = sess.attempts.get(blockId) ?? 1;
  if (isRetryable(chunk.code) && made < PAGE_RETRY_MAX_ATTEMPTS) {
    // The slot frees at once, but the block stays non-terminal so the batch cannot settle while its retry is pending.
    sess.inFlight.delete(blockId);
    clearStall(sess, blockId);
    scheduleBackoffRetry(sess, blockId, chunk.retryAfterMs);
    pump();
    return;
  }
  const err = { code: chunk.code, message: chunk.message };
  mountError(handle, err, { onRetry: () => retryBlock(blockId) });
  failBlock(sess, blockId, err);
}

/** revert=true (cancel) restores the original DOM; false (close) keeps the translations. */
function teardownSession(sess: Session, revert: boolean): void {
  window.removeEventListener('popstate', sess.checkUrlChange);
  for (const t of sess.stallTimers.values()) clearTimeout(t);
  sess.stallTimers.clear();
  for (const t of sess.backoffTimers) clearTimeout(t);
  sess.backoffTimers.clear();
  for (const id of sess.registered) {
    sess.deps.cancelRequest?.(id);
    sess.deps.onUnregister(id);
  }
  sess.registered.clear();
  setGlobalOriginalView(false);
  if (revert) sess.store.revertAll();
}

/** Cancels the translate session AND exits translate-areas mode — the nav/pagehide teardown path. */
export function cancelPageTranslateV2(): Promise<void> {
  exitMultiSelect();
  if (!active) return Promise.resolve();
  const sess = active;
  active = null;
  teardownSession(sess, true);
  sess.progress?.setLiveMessage('Page translation canceled.');
  sess.progress?.dismiss();
  return Promise.resolve();
}
