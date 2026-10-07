import type { BackendId, ErrCode, Settings, TranslationChunk } from '@/shared/types';
import { PageStore, type RenderMode } from './store';
import {
  mountBilingual,
  mountInplace,
  appendDelta,
  finish,
  mountError,
  setGlobalOriginalView,
  clearStaleError,
  type RenderHandle,
} from './renderer';
import {
  enterMultiSelect,
  exitMultiSelect,
  isMultiSelectActive,
  type SelectedBlock,
} from './multi-select';
import {
  DEFAULT_BATCH_CONCURRENCY,
  DEFAULT_TRANSLATE_TIMEOUT_MS,
  MAX_SELECTION_CHARS,
} from '@/shared/constants';
import { isRetryable } from '@/shared/error-policy';
import { errorCopy } from '@/shared/error-copy';
import { backendLabel } from '@/shared/backends/provider-profiles';
import { showToast } from '../toast';
import { sendFailureMessage } from '../translate-handlers';
import { debugCatch } from '@/shared/logger';
import { patchSettings } from '@/shared/settings-bus';
import { uuid } from '@/shared/uuid';
import { setRenderer } from '../request-state';
import { langTag } from '@/shared/lang-tag';
import { blockText, collectBlocks, hasWords, keepsPageParts, releaseOrder } from './collect';
import { settleAnnouncement, type PageProgress } from './progress';

// A free-tier backend rate-limits a many-block batch fast, so transient failures retry with jittered exponential backoff.
const PAGE_RETRY_MAX_ATTEMPTS = 3;
export function pageBackoffMs(attemptsMade: number): number {
  return Math.min(8000, 800 * 2 ** (attemptsMade - 1));
}
// Destagger the concurrent burst so retries don't thunder back in lockstep.
export function pageRetryJitterMs(): number {
  return Math.floor(globalThis.Math.random() * 400);
}

export interface ProgressHandle {
  /** One snapshot per change; the pill derives its words and buttons from it. */
  update(p: PageProgress): void;
  setLiveMessage(text: string): void;
  setOnClose(handler: () => void): void;
  setOnToggleOriginal?(handler: (showOriginal: boolean) => void): void;
  /** Puts every block back, finished ones too. */
  setOnUndoAll?(handler: () => void): void;
  setOnRetryFailed?(handler: () => void): void;
  dismiss(): void;
}

export interface PageV2Deps {
  getSettings: () => Promise<Settings>;
  /** Optional per-block lang detector; the returned id is forwarded to
   *  dispatch so each block uses its own detected source language. */
  detectLang?: (text: string) => string | undefined;
  /** Whole page only: true when a block already reads as the target language, so it is not sent. Defaults to the page's detectors. */
  isTargetLanguage?: (text: string) => boolean;
  /** The English word-list check, passed in so the page's eager chunk keeps it. */
  looksLikeEnglish?: (text: string) => boolean;

  /** Send a translate:start for one block. The requestId is generated here so
   *  it can be registered before the message races back. */
  dispatch: (requestId: string, text: string, detectedLang?: string) => Promise<void>;
  /** Tell the content router "chunks for this requestId belong to page-v2". */
  onRegister: (requestId: string) => void;
  /** Drop the page-v2 ownership for a requestId (cancel / done). */
  onUnregister: (requestId: string) => void;
  /** Send translate:cancel to the router for a still-in-flight requestId so it
   *  stops streaming + spending tokens. Called on Remove translation / nav. */
  cancelRequest?: (requestId: string) => void;
  mountProgress?: (total: number, onCancel: () => void) => ProgressHandle;
  /** The target every block is sent with; marks the translated blocks with its language. */
  target?: string;
  /** True while Ega is off on this page's site; checked before every send. */
  siteOff?: () => boolean;
  /** Runs fn after each settings change; returns the unsubscribe. */
  onSettingsChange?: (fn: () => void) => () => void;
}

interface Block {
  id: string;
  element: HTMLElement;
  text: string;
  detectedLang?: string;
}

interface Failure {
  code: ErrCode;
  message: string;
  backendId?: BackendId | undefined;
}

interface Session {
  store: PageStore;
  progress: ProgressHandle | null;
  registered: Set<string>;
  deps: PageV2Deps;
  mode: RenderMode;
  /** Tag of the target language every block is marked with. */
  lang: string | undefined;
  concurrency: number;
  stallMs: number;
  total: number;
  /** Areas that Stop dropped before they finished. */
  skipped: number;
  pending: Block[];
  /** Whole page: blocks not yet near the viewport, by id. */
  deferred: Map<string, HTMLElement>;
  /** Whole page: each collected block's page position. */
  index: Map<string, number>;
  observer: IntersectionObserver | null;
  inFlight: Set<string>;
  terminal: Set<string>;
  failed: Map<string, Failure>;
  retrying: Set<string>;
  attempts: Map<string, number>;
  handles: Map<string, RenderHandle>;
  stallTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** Blocks waiting out a backoff before their next attempt. */
  backoff: Map<string, ReturnType<typeof setTimeout>>;
  /** A rate limit pauses the whole queue, not just the block that hit it; epoch ms. */
  cooldownUntil: number;
  cooldownTimer: ReturnType<typeof setTimeout> | null;
  pausedBy: string | undefined;
  targetName: string | undefined;
  /** Stop pressed: blocks in flight finish, nothing new starts. */
  stopping: boolean;
  settledOnce: boolean;
  showingGlobalOriginal: boolean;
  checkUrlChange: () => void;
  stopSettings: () => void;
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

/**
 * Translates the whole page in the saved mode. Blocks within one screen of the viewport go first, top to
 * bottom; the rest start when the user scrolls within one screen of them. False when the page has nothing to translate.
 */
export async function runWholePageTranslate(deps: PageV2Deps): Promise<boolean> {
  if (entering) return true;
  if (active) {
    // While the pill still runs it is already there; a settled one gives way to a fresh pass over what is left.
    if (!isSettled(active)) return true;
    closeSession(active);
  }
  if (isMultiSelectActive()) exitMultiSelect();
  entering = true;
  try {
    const s = await deps.getSettings();
    const mode: RenderMode = s.pageTranslateMode === 'bilingual' ? 'bilingual' : 'inplace';
    const elements = collectBlocks(document.body, { maxChars: MAX_SELECTION_CHARS });
    if (elements.length === 0) {
      showToast('Nothing to translate on this page.');
      return false;
    }
    const sess = await createSession(deps, [], mode, elements.length);
    elements.forEach((el, i) => {
      const id = uuid();
      sess.deferred.set(id, el);
      sess.index.set(id, i);
    });
    const byElement = new Map<Element, string>();
    for (const [id, el] of sess.deferred) byElement.set(el, id);
    sess.observer = new IntersectionObserver(
      (entries) => {
        if (sess !== active) return;
        const near: number[] = [];
        const ids = new Map<number, string>();
        for (const entry of entries) {
          const id = byElement.get(entry.target);
          if (id === undefined) continue;
          if (entry.isIntersecting) {
            if (!sess.deferred.has(id)) continue;
            const at = sess.index.get(id) ?? 0;
            near.push(at);
            ids.set(at, id);
          } else {
            unqueue(sess, id);
          }
        }
        for (const at of releaseOrder(near)) {
          const id = ids.get(at);
          if (id !== undefined) release(sess, id);
        }
        report(sess);
        pump();
      },
      // One viewport height above and below.
      { rootMargin: '100% 0px 100% 0px' },
    );
    for (const el of elements) sess.observer.observe(el);
    report(sess);
    return true;
  } finally {
    entering = false;
  }
}

/** A queued block that left the band goes back to waiting; it was never mounted, so nothing needs undoing. */
function unqueue(sess: Session, id: string): void {
  const i = sess.pending.findIndex((b) => b.id === id);
  if (i < 0) return;
  const [block] = sess.pending.splice(i, 1);
  if (block) sess.deferred.set(id, block.element);
}

/** The browser's name for an ISO target; a custom language's id has none, and the pill then names no target. */
function isoName(id: string | undefined): string | undefined {
  if (id === undefined || id === 'auto') return undefined;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(id);
    return name === id ? undefined : name;
  } catch {
    return undefined;
  }
}

/** Two letters outside the Latin script: never English, whatever the word list says. */
const NON_LATIN = /(?!\p{Script=Latin})\p{L}.*(?!\p{Script=Latin})\p{L}/u;

/** A block already in the target language is skipped; the English word list only judges Latin-script text. */
function readsAsTarget(sess: Session, text: string): boolean {
  const target = sess.deps.target;
  if (target === undefined) return false;
  const detected = sess.deps.detectLang?.(text);
  if (detected !== undefined) return detected === target;
  return target === 'en' && !NON_LATIN.test(text) && sess.deps.looksLikeEnglish?.(text) === true;
}

/** Reads the text at release time, so a block the page changed since collection sends what it shows now. */
function release(sess: Session, id: string): void {
  const element = sess.deferred.get(id);
  if (!element) return;
  sess.deferred.delete(id);
  const text = element.isConnected ? blockText(element) : '';
  const isTarget = sess.deps.isTargetLanguage?.(text) ?? readsAsTarget(sess, text);
  if (!hasWords(text) || text.length > MAX_SELECTION_CHARS || isTarget) {
    // Gone from the page or already in the target language: not an area, so it leaves the count.
    sess.observer?.unobserve(element);
    sess.total--;
    return;
  }
  const detectedLang = sess.deps.detectLang?.(text);
  sess.pending.push({
    id,
    element,
    text,
    ...(detectedLang !== undefined ? { detectedLang } : {}),
  });
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

async function createSession(
  deps: PageV2Deps,
  blocks: Block[],
  mode: RenderMode,
  total: number,
): Promise<Session> {
  const s = await deps.getSettings();
  const concurrency = Math.max(
    1,
    typeof s.batchConcurrency === 'number' ? s.batchConcurrency : DEFAULT_BATCH_CONCURRENCY,
  );
  const timeoutMs =
    typeof s.translateTimeoutMs === 'number' ? s.translateTimeoutMs : DEFAULT_TRANSLATE_TIMEOUT_MS;

  const progress =
    deps.mountProgress?.(total, () => {
      if (active) stopSession(active);
    }) ?? null;
  progress?.setOnUndoAll?.(() => {
    void cancelPageTranslateV2();
  });

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

  const sess: Session = {
    store: new PageStore(),
    progress,
    registered: new Set(),
    deps,
    mode,
    lang: langTag(deps.target),
    concurrency,
    // Sits above the router's own ceiling, so it only fires when the SW dies without a terminal chunk.
    stallMs: timeoutMs + 60_000,
    total,
    skipped: 0,
    pending: [...blocks],
    deferred: new Map(),
    index: new Map(),
    observer: null,
    inFlight: new Set(),
    terminal: new Set(),
    failed: new Map(),
    retrying: new Set(),
    attempts: new Map(),
    handles: new Map(),
    stallTimers: new Map(),
    backoff: new Map(),
    cooldownUntil: 0,
    cooldownTimer: null,
    pausedBy: undefined,
    targetName: isoName(deps.target),
    stopping: false,
    settledOnce: false,
    showingGlobalOriginal: false,
    checkUrlChange,
    stopSettings: () => {},
  };
  sess.stopSettings = deps.onSettingsChange?.(() => onSettingsChanged(sess)) ?? (() => {});
  active = sess;
  return sess;
}

/** Turning Ega off on the site stops the session: nothing new is sent, what is in flight finishes. */
function onSettingsChanged(sess: Session): void {
  if (sess === active && sess.deps.siteOff?.()) stopSession(sess);
}

async function startSession(
  deps: PageV2Deps,
  selected: SelectedBlock[],
  mode: RenderMode,
): Promise<void> {
  if (active) return;
  // The same text rules as Translate page (D48): never the raw text of the chosen element.
  const blocks: Block[] = [];
  for (const b of selected) {
    const text = blockText(b.element);
    if (!hasWords(text) || text.length > MAX_SELECTION_CHARS) continue;
    const detectedLang = deps.detectLang?.(text);
    blocks.push({
      id: b.id,
      element: b.element,
      text,
      ...(detectedLang !== undefined ? { detectedLang } : {}),
    });
  }
  if (blocks.length === 0) {
    showToast('Nothing to translate in the chosen areas.');
    return;
  }
  const sess = await createSession(deps, blocks, mode, blocks.length);
  report(sess);
  pump();
}

/** The failure most blocks share, in the catalog's words, with every raw message for Error details. */
function failureCopy(sess: Session): PageProgress['failure'] {
  if (sess.failed.size === 0) return undefined;
  const counts = new Map<ErrCode, { n: number; first: Failure }>();
  for (const f of sess.failed.values()) {
    const c = counts.get(f.code);
    if (c) c.n++;
    else counts.set(f.code, { n: 1, first: f });
  }
  const [top] = [...counts.values()].sort((a, b) => b.n - a.n);
  if (!top) return undefined;
  const backend = top.first.backendId ? backendLabel(top.first.backendId) : undefined;
  const copy = errorCopy(top.first.code, top.first.message, backend ? { backend } : {});
  return {
    body: copy?.body ?? '',
    actions: copy?.actions ?? ['try-again'],
    tab: copy?.tab ?? 'backends',
    details: [...new Set([...sess.failed.values()].map((f) => f.message).filter(Boolean))],
  };
}

function snapshot(sess: Session): PageProgress {
  const failure = failureCopy(sess);
  return {
    done: sess.terminal.size,
    failed: sess.failed.size,
    total: sess.total,
    waiting: sess.deferred.size,
    inFlight: sess.inFlight.size + sess.backoff.size,
    queued: sess.pending.length,
    skipped: sess.skipped,
    settled: isSettled(sess),
    ...(sess.cooldownUntil > Date.now() ? { pausedUntil: sess.cooldownUntil } : {}),
    ...(sess.pausedBy !== undefined ? { pausedBy: sess.pausedBy } : {}),
    ...(sess.targetName !== undefined ? { target: sess.targetName } : {}),
    ...(failure ? { failure } : {}),
  };
}

function report(sess: Session): void {
  sess.progress?.update(snapshot(sess));
}

/** Dispatch queued blocks while worker slots are free. Slots free on terminal chunks, so this re-runs from markTerminal. */
function pump(): void {
  const sess = active;
  if (!sess || sess.stopping) return;
  const wait = sess.cooldownUntil - Date.now();
  if (wait > 0) {
    // One timer for the whole queue; the slots that free meanwhile stay empty until it fires.
    sess.cooldownTimer ??= setTimeout(() => {
      sess.cooldownTimer = null;
      if (sess !== active) return;
      report(sess);
      pump();
    }, wait);
    // The pill shows the pause now, while it lasts, not once it is over.
    report(sess);
    return;
  }
  // The settings update can land after the switch flips, so every send checks the site itself.
  if (sess.pending.length > 0 && sess.deps.siteOff?.()) {
    stopSession(sess);
    return;
  }
  while (sess.inFlight.size < sess.concurrency && sess.pending.length > 0) {
    const block = sess.pending.shift();
    if (!block) break;
    sess.inFlight.add(block.id);
    sess.observer?.unobserve(block.element);
    void dispatchBlock(sess, block);
  }
  report(sess);
}

async function dispatchBlock(sess: Session, block: Block): Promise<void> {
  sess.attempts.set(block.id, (sess.attempts.get(block.id) ?? 0) + 1);
  clearStaleError(block.element);
  // Replace text would remove a link, a field or a part the page keeps out, so such a block shows in Show both (D45).
  const mode: RenderMode =
    sess.mode === 'inplace' && !keepsPageParts(block.element) ? 'inplace' : 'bilingual';
  const mountArgs = { id: block.id, element: block.element, originalText: block.text };
  const handle =
    mode === 'bilingual'
      ? mountBilingual({ ...mountArgs, lang: sess.lang })
      : mountInplace({ ...mountArgs, lang: sess.lang });
  sess.handles.set(block.id, handle);
  // store.set below clears the old requestId, so unbind first or a late chunk still routes through the stale mapping.
  sess.store.unbindRequest(block.id);
  sess.store.set({
    id: block.id,
    element: block.element,
    mode,
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
    if (sess !== active || sess.handles.get(block.id) !== handle) return;
    const err = { code: 'NETWORK' as const, message: sendFailureMessage(e) };
    mountError(handle, err, { onRetry: () => retryBlock(block.id) });
    failBlock(sess, block.id, err);
    return;
  }
  // Remove translation or a re-dispatch replaced this attempt while the send was in flight.
  if (sess !== active || sess.handles.get(block.id) !== handle) return;
  sess.store.bindRequest(block.id, requestId);
  if (sess.terminal.has(block.id)) return;
  armStall(sess, block.id);
}

function failBlock(sess: Session, blockId: string, err: Failure): void {
  sess.failed.set(blockId, err);
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
  maybeSettle(sess);
  pump();
}

function maybeSettle(sess: Session): void {
  report(sess);
  if (!isSettled(sess)) return;
  sess.observer?.disconnect();
  sess.observer = null;
  const p = sess.progress;
  if (!p) return;
  p.setLiveMessage(settleAnnouncement(snapshot(sess)));
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
  p.setOnRetryFailed?.(() => {
    for (const blockId of [...sess.failed.keys()]) retryBlock(blockId);
  });
  p.setOnClose(() => {
    closeSession(sess);
  });
}

/** Drops a mounted block that never finished: Stop and a retry after Stop leave nothing half-done on the page. */
function dropBlock(sess: Session, id: string): void {
  sess.handles.get(id)?.revert();
  sess.handles.delete(id);
  sess.store.delete(id);
  sess.inFlight.delete(id);
  clearStall(sess, id);
  sess.total--;
  sess.skipped++;
}

/** Stop: nothing new starts, blocks in flight finish, and the session settles on what is done. */
function stopSession(sess: Session): void {
  if (sess !== active || isSettled(sess)) return;
  // Nothing finished and nothing coming means nothing to keep, so Stop is the same as Remove translation.
  if (sess.terminal.size === 0 && sess.inFlight.size === 0) {
    void cancelPageTranslateV2();
    return;
  }
  sess.stopping = true;
  sess.observer?.disconnect();
  sess.observer = null;
  if (sess.cooldownTimer) clearTimeout(sess.cooldownTimer);
  sess.cooldownTimer = null;
  const unstarted = sess.deferred.size + sess.pending.length;
  sess.deferred.clear();
  sess.pending = [];
  sess.total -= unstarted;
  sess.skipped += unstarted;
  // A block waiting out a backoff is mounted with its pending look; a retry is a new start, so it goes too.
  for (const [id, timer] of sess.backoff) {
    clearTimeout(timer);
    dropBlock(sess, id);
  }
  sess.backoff.clear();
  // A manual retry un-terminals blocks; any still queued for one were cleared with `pending` above.
  maybeSettle(sess);
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
    // Try again needs a live session; without the pill the button would do nothing.
    handle.target
      .querySelector('[data-ega-tx-error]')
      ?.shadowRoot?.querySelector('button')
      ?.remove();
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
  const err = { code: 'TIMEOUT' as const, message: 'No reply in time.' };
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
  // A manual retry is a new start: it lifts a stopped session and resets the block's backoff budget.
  sess.stopping = false;
  sess.terminal.delete(blockId);
  sess.attempts.delete(blockId);
  sess.failed.delete(blockId);
  redispatch(sess, blockId);
}

/** Transient failure: wait out a backoff, then re-dispatch — no chip yet.
 *  A server Retry-After hint (429/503/529) is a floor on the delay; jitter rides on top. */
function scheduleBackoffRetry(sess: Session, blockId: string, retryAfterMs?: number): number {
  const made = sess.attempts.get(blockId) ?? 1;
  const delay = Math.max(pageBackoffMs(made), retryAfterMs ?? 0) + pageRetryJitterMs();
  const timer = setTimeout(() => {
    sess.backoff.delete(blockId);
    if (sess !== active) return;
    redispatch(sess, blockId);
  }, delay);
  sess.backoff.set(blockId, timer);
  return delay;
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
  if (isRetryable(chunk.code, made) && made < PAGE_RETRY_MAX_ATTEMPTS) {
    if (sess.stopping) {
      // A retry is a new start, and Stop allows none: the block goes back to its original.
      dropBlock(sess, blockId);
      maybeSettle(sess);
      return;
    }
    // The slot frees at once, but the block stays non-terminal so the batch cannot settle while its retry is pending.
    sess.inFlight.delete(blockId);
    clearStall(sess, blockId);
    const delay = scheduleBackoffRetry(sess, blockId, chunk.retryAfterMs);
    // The limit is on the key, not the block: the freed slot would send the next block straight into it.
    if (chunk.code === 'RATE_LIMIT') {
      sess.cooldownUntil = Math.max(sess.cooldownUntil, Date.now() + delay);
      if (chunk.backendId) sess.pausedBy = backendLabel(chunk.backendId);
    }
    pump();
    return;
  }
  const err = { code: chunk.code, message: chunk.message, backendId: chunk.backendId };
  mountError(handle, err, {
    onRetry: () => retryBlock(blockId),
    ...(chunk.backendId ? { backend: backendLabel(chunk.backendId) } : {}),
  });
  failBlock(sess, blockId, err);
}

/** revert=true (Remove translation) restores the original DOM; false (close) keeps the translations. */
function teardownSession(sess: Session, revert: boolean): void {
  window.removeEventListener('popstate', sess.checkUrlChange);
  sess.stopSettings();
  sess.observer?.disconnect();
  sess.observer = null;
  for (const t of sess.stallTimers.values()) clearTimeout(t);
  sess.stallTimers.clear();
  for (const t of sess.backoff.values()) clearTimeout(t);
  sess.backoff.clear();
  if (sess.cooldownTimer) clearTimeout(sess.cooldownTimer);
  sess.cooldownTimer = null;
  for (const id of sess.registered) {
    sess.deps.cancelRequest?.(id);
    sess.deps.onUnregister(id);
  }
  sess.registered.clear();
  setGlobalOriginalView(false);
  if (revert) sess.store.revertAll();
}

/** Remove translation, and the nav/pagehide teardown: cancels the session, restores the page, exits area picking. */
export function cancelPageTranslateV2(): Promise<void> {
  exitMultiSelect();
  if (!active) return Promise.resolve();
  const sess = active;
  active = null;
  teardownSession(sess, true);
  sess.progress?.setLiveMessage('Translation removed.');
  sess.progress?.dismiss();
  return Promise.resolve();
}
