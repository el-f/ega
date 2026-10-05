import { debugCatch } from '@/shared/logger';
import { mount, unmount, type ComponentProps } from 'svelte';
import Tooltip from './Tooltip.svelte';
import { getContainer, onShadowHostRemount } from './shadowHost';
import { hideBubble } from './bubble';
import { endRequest, rendererOwner, stopRequestStream, type DoneMeta } from './request-state';
import {
  createMemoizedJsonParser,
  extractDetectedFields,
  streamingTranslation,
} from '@/shared/backends/base';
import type { DetectedVariety, ErrCode, PageContext, ResultMeta } from '@/shared/types';
import type { Tone } from '@/shared/task-prompts';
import type { TaskId } from '@/shared/task-view';
import type { SettingsTab } from '@/shared/settings-tabs';
import { stuckTimeoutMs } from '@/shared/stuck-timeout';
import { escalateToSidepanel, type EscalationKind } from './tooltip/handoff';
import { showToast } from './toast';

interface OpenOpts {
  requestId: string;
  srcText: string;
  rect: DOMRect;
  /** Live anchor for repositioning; callers without one fall back to mount-time `rect`. */
  range?: Range;
  confidencePill?: boolean;
  /** Hide pill when `confidence < threshold`. */
  confidencePillThreshold?: number;
  clickOutsideDismiss?: boolean;
  showSource?: boolean;
  draggable?: boolean;
  /** Context shipped with this request; null when contextEnabled is off. */
  contextSent?: PageContext | null;
  contextPreviewOpen?: boolean;
  /** Lets the swap button disable itself when source is 'auto'. */
  direction?: { source: string; target: string };
  onRetry?: () => void;
  onCancel?: () => void;
  /** User dismissed the tooltip (Esc, click-outside, close). `onCancel` is the mid-run cancel. */
  onClose?: () => void;
  onExplain?: () => void;
  onOpenOptions?: (tab?: SettingsTab) => void;
  onSwap?: () => void;
  task?: TaskId;
  /** The task whose switches the router applies: Explain for an explain-flag re-run, else `task`. */
  contextTask?: TaskId;
  tone?: Tone;
  onTaskChange?: (task: TaskId, tone: Tone) => void;
  /** When set, the tooltip shows the thumbnail and hides Explain. */
  imageUrl?: string;
  /** Body the finished translation is diffed against on a re-translate. */
  priorTranslation?: string;
  /** Overrides the shimmer's task gerund (explain-flag re-runs keep task=translate). */
  loadingLabel?: string;
  /** Ceiling for the stuck guard. Callers derive it from the timeout the router really uses. */
  stuckTimeoutMs?: number;
}

export interface TipState {
  srcText: string;
  body: string;
  loading: boolean;
  confidence?: number;
  confidencePill: boolean;
  /** Hide the pill below this confidence. `0` or absent means always show. Range 0..1. */
  confidencePillThreshold?: number;
  detectedLang?: string;
  detectedDetail?: string;
  /** Set only when the source mixes varieties; replaces the single `detectedLang` pill. */
  detectedLangs?: DetectedVariety[];
  explain?: string;
  error?: { code: ErrCode; message: string };
  copied?: boolean;
  left: number;
  top: number;
  /** The PageContext snapshot shipped with this request; null when contextEnabled is off. */
  contextSent?: PageContext | null;
  contextPreviewOpen?: boolean;
  task?: TaskId;
  contextTask?: TaskId;
  tone?: Tone;
  /** Present only when the ⓘ inspector has something to show (`captureResultMeta` on). */
  meta?: ResultMeta;
  /** Set for image-translate results; the Explain action hides because there is no source text. */
  imageUrl?: string;
  /** True when the explanation was grounded in an attached image. */
  usedImage?: boolean;
  /** Earlier translation body; TooltipBody diffs the new one against it. */
  priorTranslation?: string;
  /** True on the done or error frame; the diff only renders after that. */
  settled?: boolean;
  /** Overrides the shimmer's task gerund (explain-flag re-runs). */
  loadingLabel?: string;
  /** True while the server's Retry-After window is open; Retry renders disabled. */
  retryBlocked?: boolean;
  /** Whole seconds left in the Retry-After window; drives the countdown label. */
  retryRemainingSec?: number;
}

interface Entry {
  handle: ReturnType<typeof mount>;
  anchor: HTMLDivElement;
  state: TipState;
  rawAcc: string;
  parseJson: ReturnType<typeof createMemoizedJsonParser>;
  timeoutId: ReturnType<typeof setTimeout>;
  /** Ceiling the guard re-arms with after every delta. */
  stuckMs: number;
  /** Ticks the Retry-After countdown once per second. */
  countdownId?: ReturnType<typeof setInterval>;
  ro?: ResizeObserver;
  /** Capture-phase scroll listener, so any overflow-scroll ancestor reaches it. */
  onScroll?: () => void;
  /** Sticky after first terminal (done/error). Late chunks must not re-paint. */
  finished: boolean;
}

// One tooltip per tab by construction: openTooltip always disposes the previous one first.
let current: { id: string; entry: Entry } | null = null;

function entryFor(requestId: string): Entry | undefined {
  return current?.id === requestId ? current.entry : undefined;
}

const VIEWPORT_SAFE_MARGIN = 20;

export function positionFromRect(r: DOMRect): { left: number; top: number } {
  const top = r.bottom + 10;
  const left = Math.min(window.innerWidth - 370, Math.max(8, r.left));
  return { left, top };
}

/** Pins to whichever side has more room; never clamps to a viewport corner. */
export function repositionIfOverflow(state: TipState, element: HTMLElement, anchor: DOMRect): void {
  const rect = element.getBoundingClientRect();
  const vh = window.innerHeight;
  const gap = 8;
  const spaceBelow = vh - anchor.bottom - gap - VIEWPORT_SAFE_MARGIN;
  const spaceAbove = anchor.top - gap - VIEWPORT_SAFE_MARGIN;
  const needed = rect.height;

  state.left = Math.min(window.innerWidth - 370, Math.max(8, anchor.left));

  if (needed <= spaceBelow) {
    state.top = anchor.bottom + gap;
    return;
  }
  if (needed <= spaceAbove) {
    state.top = anchor.top - needed - gap;
    return;
  }
  if (spaceBelow >= spaceAbove) {
    state.top = anchor.bottom + gap;
  } else {
    state.top = Math.max(gap, anchor.top - needed - gap);
  }
}

function createTooltipAnchor(requestId: string): HTMLDivElement {
  const anchor = document.createElement('div');
  anchor.setAttribute('data-ega-tooltip-wrap', requestId);
  getContainer().appendChild(anchor);
  return anchor;
}

function buildTipState(o: OpenOpts): TipState {
  const pos = positionFromRect(o.rect);
  const state: TipState = $state({
    srcText: o.srcText,
    body: '',
    loading: true,
    confidencePill: o.confidencePill ?? true,
    ...(o.confidencePillThreshold !== undefined
      ? { confidencePillThreshold: o.confidencePillThreshold }
      : {}),
    left: pos.left,
    top: pos.top,
    contextSent: o.contextSent ?? null,
    contextPreviewOpen: o.contextPreviewOpen ?? false,
    task: o.task ?? 'translate',
    ...(o.contextTask !== undefined ? { contextTask: o.contextTask } : {}),
    tone: o.tone ?? 'neutral',
    ...(o.imageUrl !== undefined ? { imageUrl: o.imageUrl } : {}),
    ...(o.loadingLabel !== undefined ? { loadingLabel: o.loadingLabel } : {}),
    ...(o.priorTranslation !== undefined && o.priorTranslation !== ''
      ? { priorTranslation: o.priorTranslation }
      : {}),
    settled: false,
  });
  return state;
}

function buildTooltipProps(o: OpenOpts, state: TipState): ComponentProps<typeof Tooltip> {
  return {
    tip: state,
    clickOutsideDismiss: o.clickOutsideDismiss ?? true,
    showSource: o.showSource ?? false,
    draggable: o.draggable ?? false,
    ...(o.direction ? { direction: o.direction } : {}),
    ...(o.onSwap ? { onswap: () => o.onSwap?.() } : {}),
    ...(o.onTaskChange
      ? {
          ontaskchange: (t: TaskId, tn: Tone) => {
            state.task = t;
            state.tone = tn;
            o.onTaskChange?.(t, tn);
          },
        }
      : {}),
    onclose: () => {
      o.onClose?.();
      closeTooltip(o.requestId);
    },
    oncancel: () => {
      o.onCancel?.();
      closeTooltip(o.requestId);
    },
    ...(o.onRetry ? { onretry: () => o.onRetry?.() } : {}),
    oncopy: () => {
      void navigator.clipboard
        .writeText(state.body)
        .then(() => {
          state.copied = true;
          setTimeout(() => {
            const e = entryFor(o.requestId);
            if (e) e.state.copied = false;
          }, 1500);
        })
        .catch(() => {});
    },
    onexplain: () => o.onExplain?.(),
    ...(o.onOpenOptions ? { onopenoptions: (tab?: SettingsTab) => o.onOpenOptions?.(tab) } : {}),
    onescalate: (kind: EscalationKind): void => {
      void escalateToSidepanel({
        subKind: kind,
        text: state.srcText,
        sourceLang: o.direction?.source ?? 'auto',
        targetLang: o.direction?.target ?? 'en',
        ...(o.task ? { task: o.task } : {}),
        ...(o.tone ? { tone: o.tone } : {}),
        // Pin sends the explanation as context to re-dispatch; open-image lands a finished turn.
        ...(state.explain
          ? kind === 'pin'
            ? { explain: state.explain }
            : { response: state.explain }
          : {}),
        ...(state.imageUrl ? { imageDataUrl: state.imageUrl } : {}),
        ...(kind === 'open-image' ? { ocrText: state.body } : {}),
        ...(state.error ? { errorCode: state.error.code } : {}),
      }).then((opened) => {
        if (!opened) {
          showToast('Could not open the side panel.');
          return;
        }
        // The panel re-dispatches the text, so this tooltip's stream must stop, not just hide.
        o.onClose?.();
        closeTooltip(o.requestId);
      });
    },
  };
}

function installRepositioning(
  anchor: HTMLDivElement,
  state: TipState,
  requestId: string,
  rect: DOMRect,
  range: Range | undefined,
): void {
  queueMicrotask(() => {
    const rootEl = anchor.querySelector<HTMLElement>('.tooltip');
    if (!rootEl) return;
    // getBoundingClientRect is viewport-relative, so scroll must re-read it, not just resize.
    const getAnchorRect = (): DOMRect => {
      const live = range?.getBoundingClientRect();
      return live && live.width + live.height > 0 ? live : rect;
    };
    const repos = (): void => repositionIfOverflow(state, rootEl, getAnchorRect());
    const ro = new ResizeObserver(repos);
    ro.observe(rootEl);
    // rAF rate-limit so fast scroll wheels don't fire 120 repos/sec.
    let scrollQueued = false;
    const onScroll = (): void => {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        repos();
      });
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    const e = entryFor(requestId);
    if (e) {
      e.ro = ro;
      e.onScroll = onScroll;
      repos();
    } else {
      // Entry closed during the microtask window, so nothing owns these listeners.
      try {
        ro.disconnect();
      } catch (err) {
        debugCatch(err, 'content.tipState.installRepositioning.ro');
      }
      try {
        document.removeEventListener('scroll', onScroll, { capture: true });
      } catch (err) {
        debugCatch(err, 'content.tipState.installRepositioning.scroll');
      }
    }
  });
}

// A replaced tooltip never runs its onClose, so its request would keep streaming into a surface nobody can see.
function releaseSupersededRequests(nextId: string): void {
  for (const [id, owner] of rendererOwner) {
    if (id !== nextId && owner === 'tooltip') endRequest(id, 'superseded');
  }
}

function armStuckGuard(requestId: string, stuckMs: number): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    // Painting the error alone leaves the worker streaming into a tooltip that already gave up.
    stopRequestStream(requestId);
    errorTooltip(requestId, { code: 'TIMEOUT', message: 'No reply in time. Try again.' });
  }, stuckMs);
}

export function openTooltip(o: OpenOpts): void {
  releaseSupersededRequests(o.requestId);
  closeTooltip();
  // Tooltip and bubble overlap; the tooltip wins.
  hideBubble();
  const anchor = createTooltipAnchor(o.requestId);
  const state = buildTipState(o);
  const stuckMs = o.stuckTimeoutMs ?? stuckTimeoutMs(null);
  const timeoutId = armStuckGuard(o.requestId, stuckMs);
  const handle = mount(Tooltip, { target: anchor, props: buildTooltipProps(o, state) });
  current = {
    id: o.requestId,
    entry: {
      handle,
      anchor,
      state,
      rawAcc: '',
      parseJson: createMemoizedJsonParser(),
      timeoutId,
      stuckMs,
      finished: false,
    },
  };
  installRepositioning(anchor, state, o.requestId, o.rect, o.range);
}

export function appendDelta(requestId: string, delta: string): void {
  const e = entryFor(requestId);
  if (!e || e.finished) return;
  // A stream that dies mid-body takes the worker's own timer with it, so every delta re-arms this guard.
  clearTimeout(e.timeoutId);
  e.timeoutId = armStuckGuard(requestId, e.stuckMs);
  e.rawAcc += delta;
  const parsed = e.parseJson(e.rawAcc);
  e.state.body = streamingTranslation(e.rawAcc, parsed);
  // The first chunk is often the JSON envelope's `{"` with no visible text yet; keep the shimmer until there is some.
  if (e.state.body.length > 0) e.state.loading = false;
}

export function finishTooltip(requestId: string, o: DoneMeta): void {
  const e = entryFor(requestId);
  if (!e || e.finished) return;
  clearTimeout(e.timeoutId);
  const parsed = e.parseJson(e.rawAcc);
  e.state.body = streamingTranslation(e.rawAcc, parsed);
  e.state.loading = false;
  if (o.confidence !== undefined) e.state.confidence = o.confidence;
  const det = extractDetectedFields(parsed, o);
  if (det.detectedLang !== undefined) e.state.detectedLang = det.detectedLang;
  if (det.detectedDetail !== undefined) e.state.detectedDetail = det.detectedDetail;
  if (det.detectedLangs !== undefined) e.state.detectedLangs = det.detectedLangs;
  if (det.explain !== undefined) e.state.explain = det.explain;
  if (o.meta !== undefined) e.state.meta = o.meta;
  if (o.usedImage === true) e.state.usedImage = true;
  e.state.settled = true;
  e.finished = true;
}

/** Skips the streaming JSON accumulator: image-translate arrives in one message. */
export function finishTooltipDirect(
  requestId: string,
  body: string,
  confidence?: number,
  extra: Pick<
    TipState,
    'explain' | 'detectedLang' | 'detectedDetail' | 'detectedLangs' | 'usedImage'
  > = {},
): void {
  const e = entryFor(requestId);
  if (!e || e.finished) return;
  clearTimeout(e.timeoutId);
  e.state.body = body;
  e.state.loading = false;
  if (confidence !== undefined) e.state.confidence = confidence;
  if (extra.detectedLang !== undefined) e.state.detectedLang = extra.detectedLang;
  if (extra.detectedDetail !== undefined) e.state.detectedDetail = extra.detectedDetail;
  if (extra.detectedLangs !== undefined) e.state.detectedLangs = extra.detectedLangs;
  if (extra.explain !== undefined) e.state.explain = extra.explain;
  if (extra.usedImage === true) e.state.usedImage = true;
  e.state.settled = true;
  e.finished = true;
}

export function errorTooltip(
  requestId: string,
  errInfo: { code: ErrCode; message: string; retryAfterMs?: number },
): void {
  const e = entryFor(requestId);
  if (!e || e.finished) return;
  clearTimeout(e.timeoutId);
  e.state.loading = false;
  e.state.error = { code: errInfo.code, message: errInfo.message };
  // Honor the server's Retry-After: Retry stays disabled, with a live countdown, until the window passes.
  if (errInfo.retryAfterMs !== undefined && errInfo.retryAfterMs > 0) {
    const waitMs = Math.min(errInfo.retryAfterMs, 60_000);
    const deadline = Date.now() + waitMs;
    e.state.retryBlocked = true;
    e.state.retryRemainingSec = Math.ceil(waitMs / 1000);
    e.countdownId = setInterval(() => {
      const cur = entryFor(requestId);
      if (!cur) return;
      const leftMs = deadline - Date.now();
      if (leftMs <= 0) {
        if (cur.countdownId !== undefined) clearInterval(cur.countdownId);
        delete cur.countdownId;
        cur.state.retryBlocked = false;
        cur.state.retryRemainingSec = 0;
        return;
      }
      cur.state.retryRemainingSec = Math.ceil(leftMs / 1000);
    }, 1_000);
  }
  e.finished = true;
}

/** Undefined for an unfinished, errored or empty tooltip, so no diff runs against partial text. */
export function getTooltipBody(requestId: string): string | undefined {
  const e = entryFor(requestId);
  if (!e?.finished) return undefined;
  if (e.state.error) return undefined;
  if (!e.state.body) return undefined;
  return e.state.body;
}

function disposeCurrent(): void {
  if (!current) return;
  const e = current.entry;
  clearTimeout(e.timeoutId);
  if (e.countdownId !== undefined) clearInterval(e.countdownId);
  try {
    e.ro?.disconnect();
  } catch (err) {
    debugCatch(err, 'content.tipState.disposeEntry.ro');
  }
  if (e.onScroll) {
    try {
      document.removeEventListener('scroll', e.onScroll, { capture: true });
    } catch (err) {
      debugCatch(err, 'content.tipState.disposeEntry.scroll');
    }
  }
  try {
    void unmount(e.handle);
  } catch (err) {
    debugCatch(err, 'content.tipState.disposeEntry.unmount');
  }
  e.anchor.remove();
  current = null;
}

export function closeTooltip(requestId?: string): void {
  if (requestId !== undefined && current?.id !== requestId) return;
  disposeCurrent();
}

onShadowHostRemount(closeTooltip);
