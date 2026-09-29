import { uuid } from '@/shared/uuid';
import { swapDirection } from '@/shared/site-profile';
import { openTooltip, getTooltipBody } from './lazy-tooltip';
import {
  beginRequest,
  endRequest,
  pending,
  perfTimers,
  rendererFor,
  type PendingReq,
} from './request-state';
import type { Msg } from '@/shared/messages';
import type { Settings } from '@/shared/types';
import type { SettingsTab } from '@/shared/settings-tabs';
import { TASK_GERUND, type Task, type Tone } from '@/shared/task-prompts';
import { createLogger, debugCatch } from '@/shared/logger';
import { omitUndef } from '@/shared/utils/omitUndef';
import { findDominantPostImage } from './dominant-image';
import {
  isExtensionContextValid,
  isContextInvalidatedError,
  CONTEXT_INVALIDATED_MESSAGE,
  SEND_FAILED_MESSAGE,
} from './context-guard';
import { imageStuckTimeoutMs, stuckTimeoutMs } from '@/shared/stuck-timeout';
import { showToast } from './toast';

const log = createLogger('cs.handlers');

/** An extension reload both kills the runtime and 404s every lazy chunk, so the two read as one failure. */
function isReloadFailure(e: unknown): boolean {
  if (!isExtensionContextValid() || isContextInvalidatedError(e)) return true;
  const msg = e instanceof Error ? e.message : '';
  return /dynamically imported module|failed to fetch/i.test(msg);
}

export function showReloadToast(): void {
  showToast(CONTEXT_INVALIDATED_MESSAGE, { label: 'Reload page', run: () => location.reload() });
}

/** A user-triggered entry point that rejects silently looks like a dead button; say what happened. */
export function reportEntryFailure(e: unknown, where: string): void {
  debugCatch(e, where);
  if (isReloadFailure(e)) showReloadToast();
}

/** A dead context throws from sendMessage itself, before any promise exists to reject. */
export function sendFromEntry(msg: Msg, where: string): void {
  try {
    void chrome.runtime.sendMessage(msg).catch((e: unknown) => reportEntryFailure(e, where));
  } catch (e) {
    reportEntryFailure(e, where);
  }
}

/** A content script has no `chrome.runtime.openOptionsPage`; the worker owns that call. */
export function openOptionsFromContent(tab?: SettingsTab): void {
  sendFromEntry({ kind: 'ui:open-options', ...(tab ? { tab } : {}) }, 'content.openOptions');
}

export interface HandlerDeps {
  ensureSettings(): Promise<Settings>;
}

export async function fireTranslate(
  req: PendingReq,
  explain: boolean,
  streaming: boolean,
): Promise<void> {
  perfTimers.set(req.id, { startedAt: performance.now(), firstDelta: null });
  try {
    await chrome.runtime.sendMessage({
      kind: 'translate:start',
      requestId: req.id,
      text: req.text,
      sourceLang: req.sourceLang,
      ...(req.targetLang ? { targetLang: req.targetLang } : {}),
      ...(req.context ? { context: req.context } : {}),
      options: {
        stream: streaming,
        explain,
        ...(req.task && req.task !== 'translate' ? { task: req.task } : {}),
        ...(req.tone ? { tone: req.tone } : {}),
        ...(req.imageUrl ? { imageUrl: req.imageUrl } : {}),
      },
    } satisfies Msg);
  } catch (e) {
    log.warn('sendMessage failed', e);
    // An extension reload orphans the injected script, and only a page reload re-injects a live one.
    const message = isContextInvalidatedError(e)
      ? CONTEXT_INVALIDATED_MESSAGE
      : SEND_FAILED_MESSAGE;
    // The renderer that owns the request paints the failure; an inline span would otherwise shimmer to its stall guard.
    rendererFor(req.id)?.error(req.id, { code: 'NETWORK', message });
  }
}

interface ReopenOpts {
  reqOverrides?: Partial<PendingReq>;
  explain?: boolean;
  /** A diff against the previous body only makes sense for the same task in the same direction. */
  noDiff?: boolean;
}

/** The one assembly for tooltip OpenOpts — first open and every reopen must not drift apart. */
export function buildTooltipOpenOpts(
  deps: HandlerDeps,
  s: Settings,
  req: PendingReq,
  extra: { priorTranslation?: string; loadingLabel?: string } = {},
): Parameters<typeof openTooltip>[0] {
  const reqId = req.id;
  return {
    requestId: reqId,
    srcText: req.text,
    rect: req.rect,
    ...(req.range ? { range: req.range } : {}),
    confidencePill: s.confidencePill,
    ...omitUndef({ confidencePillThreshold: s.confidencePillThreshold }),
    clickOutsideDismiss: s.tooltipClickOutside,
    showSource: s.tooltipShowSource,
    draggable: s.tooltipDraggable,
    contextSent: req.context ?? null,
    contextPreviewOpen: false,
    direction: req.direction,
    stuckTimeoutMs: req.imageUrl ? imageStuckTimeoutMs(s) : stuckTimeoutMs(s),
    ...omitUndef({
      task: req.task,
      tone: req.tone,
      priorTranslation: extra.priorTranslation,
      loadingLabel: extra.loadingLabel,
    }),
    onTaskChange: (t, tn) => {
      void retranslateWithTask(deps, reqId, t, tn);
    },
    onRetry: () => void retryTranslate(deps, reqId),
    onCancel: () => endRequest(reqId, 'cancel'),
    onClose: () => endRequest(reqId, 'close'),
    onExplain: () => void explainTranslate(deps, reqId),
    onSwap: () => void swapTranslate(deps, reqId),
    onOpenOptions: openOptionsFromContent,
  };
}

async function reopenTooltip(
  deps: HandlerDeps,
  originalId: string,
  opts: ReopenOpts = {},
): Promise<void> {
  const prev = pending.get(originalId);
  if (!prev) return;
  // Claim the row before the first await, or a double-click mints two requests from one original.
  pending.delete(originalId);
  const s = await deps.ensureSettings();
  // Capture the prior body first, because ending the request closes its tooltip.
  const priorBody = await getTooltipBody(originalId);
  endRequest(originalId, 'reopen');
  const newId = uuid();
  // Explain sticks to the request: a Retry on an explain tooltip must re-run the explain, not a plain translate.
  const explain = opts.explain ?? prev.explain ?? false;
  const req: PendingReq = { ...prev, id: newId, ...opts.reqOverrides, explain };
  // A diff across two different tasks is all del+add spans, because the outputs share no structure.
  const taskChanged = opts.noDiff === true || opts.explain === true || req.task !== prev.task;
  const diffBody = taskChanged ? undefined : priorBody;
  // One-shot: a stored image would reroute the next Retry or task-switch to OCR.
  const stored: PendingReq = { ...req };
  delete stored.imageUrl;
  pending.set(newId, stored);
  beginRequest(newId, 'tooltip');
  openTooltip(
    buildTooltipOpenOpts(deps, s, req, {
      ...(diffBody !== undefined ? { priorTranslation: diffBody } : {}),
      // The explain flag re-runs the translate task, so the gerund needs an explicit override.
      ...(explain ? { loadingLabel: TASK_GERUND.explain } : {}),
    }),
  );
  await fireTranslate(req, explain, s.streaming);
}

export async function retryTranslate(deps: HandlerDeps, originalId: string): Promise<void> {
  await reopenTooltip(deps, originalId);
}

export async function retranslateWithTask(
  deps: HandlerDeps,
  originalId: string,
  task: Task,
  tone: Tone,
): Promise<void> {
  await reopenTooltip(deps, originalId, { explain: false, reqOverrides: { task, tone } });
}

export async function explainTranslate(deps: HandlerDeps, originalId: string): Promise<void> {
  const s = await deps.ensureSettings();
  const imageUrl = s.explainUsesPageImage ? (findDominantPostImage() ?? undefined) : undefined;
  // Explain reads the source text: kept, a summarize or reword task would build its own template and ignore explain.
  await reopenTooltip(deps, originalId, {
    explain: true,
    reqOverrides: { task: 'translate', ...(imageUrl ? { imageUrl } : {}) },
  });
}

/** Same task, tone, context and surface as the original; only the direction flips. The swapped source is the old target, so no detection is needed. */
export async function swapTranslate(deps: HandlerDeps, originalId: string): Promise<void> {
  const prev = pending.get(originalId);
  if (!prev) return;
  const swapped = swapDirection(prev.direction);
  await reopenTooltip(deps, originalId, {
    noDiff: true,
    reqOverrides: {
      direction: swapped,
      requestedDirection: swapped,
      sourceLang: swapped.source,
      targetLang: swapped.target,
    },
  });
}
