// What reaches the panel without a keystroke: worker messages, queued image seeds and handoffs.

import { ALL_ERR_CODES, type ErrCode, type PageContext } from '@/shared/types';
import { errCodeLabel } from '@/shared/err-labels';
import { optionsTabForMessage } from '@/shared/error-policy';
import { openOptionsTab } from '@/shared/open-options-tab';
import { selectionTrimmedMessage } from '@/shared/selection-cap-copy';
import { asLangSelection } from '@/shared/brands';
import { debugCatch } from '@/shared/logger';
import { isSafeRenderImageSrc } from '@/shared/image-url-guard';
import { toastStore } from '@/shared/components/toastStore';
import { hasKnownKind, isFromOwnBackground, type Msg } from '@/shared/messages';
import { drainPendingImageSeeds, removePendingImageSeed } from '@/shared/pending-image-seed';
import { drainPendingPopupHandoff, type PendingPopupHandoff } from '@/shared/pending-popup-handoff';
import { conversationLabel } from '@/shared/saved-conversations';
import { builtInTask, type Task, type Tone } from '@/shared/task-prompts';
import type { TaskId } from '@/shared/task-view';
import { auditSurfaceLabel } from '../audit-surface-label';
import { getPanelWindowId } from './active-origin';
import type { ConversationContainer } from './conversation.svelte';

/** The composer's language, task and tone pickers. */
export interface Pickers {
  sourceLang: string;
  targetLang: string;
  task: TaskId;
  tone: Tone;
}

export interface IntakeDeps {
  conversation: ConversationContainer;
  /** Undefined until resolved; every window check fails open on undefined. */
  panelWindowId: () => number | undefined;
  streaming: () => boolean;
  pickers: () => Pickers;
  setPickers: (p: Pickers) => void;
  /** The task a handoff names when it is known and on; null runs it as Translate. */
  runnableTask: (task: TaskId) => TaskId | null;
  pageContext: (task: TaskId) => Promise<PageContext | null>;
  /** A new exchange is never bookmarked and never matches an old query, so a filter would hide it. */
  clearFilters: () => void;
  /** Puts an image in the composer, unsent, and focuses it. */
  attachImage: (src: string) => void;
  /** The panel's own tab follow, so the toasts about the conversation it leaves close too. */
  followSite: (site: string) => Promise<boolean>;
  /** Settles when the panel's first follow of the tab is over; until then the tab's site is unknown. */
  firstFollow: Promise<void>;
}

export interface Intake {
  onRuntimeMessage: (raw: unknown, sender?: chrome.runtime.MessageSender) => boolean;
  /** Seeds the context-menu image requests queued for this window while the panel was closed. */
  drainImageSeeds: (windowId: number | undefined) => Promise<void>;
  /** Lands every popup and tooltip handoff queued for this window. */
  drainPopupHandoffs: () => Promise<void>;
}

export function createIntake(deps: IntakeDeps): Intake {
  const { conversation } = deps;
  let followed = false;
  void deps.firstFollow.then(() => {
    followed = true;
  });

  /** A handoff or an image click comes from the tab, so it never lands in another site's conversation. */
  async function toTabSite(): Promise<void> {
    const site = conversation.tabSite;
    if (conversation.activeSite === site) return;
    let switched = false;
    try {
      switched = await deps.followSite(site);
    } catch (e) {
      // A failed switch still lands it, in the conversation on screen.
      debugCatch(e, 'sidepanel.toTabSite');
    }
    // A switch already under way (the panel opening, a tab change) is not news.
    if (!switched || conversation.activeSite !== site) return;
    // The reply's own status takes the stream's live region next, so the switch gets its own line.
    toastStore.push({
      message: `Switched to the conversation for this tab: ${conversationLabel(site)}.`,
      variant: 'info',
    });
  }

  /** Seeds at once when the tab's site is on screen, so no chunk can come first. */
  async function seedImage(
    requestId: string,
    imageUrl: string,
    task: TaskId | undefined,
    warn = false,
  ): Promise<void> {
    if (!followed || conversation.activeSite !== conversation.tabSite) {
      conversation.holdRequest(requestId);
      await deps.firstFollow;
      await toTabSite();
    }
    // After a switch the reply running in the other conversation finishes there, so nothing is stopped.
    if (warn) warnIfStoppingInflight();
    conversation.seedExternalImageTurn(
      requestId,
      imageUrl,
      {
        sourceLang: asLangSelection('auto'),
        targetLang: asLangSelection(deps.pickers().targetLang),
        stream: deps.streaming(),
      },
      task,
    );
  }

  /** A seed or handoff takes the one inflight slot, so the running reply lands as Canceled — say why. */
  function warnIfStoppingInflight(): void {
    if (conversation.inflightId === null) return;
    toastStore.push({
      message: 'Stopped the current reply to answer your new selection.',
      variant: 'warning',
    });
  }

  function onSeedMessage(msg: Extract<Msg, { kind: 'sidepanel:seed-image-translate' }>): void {
    // Another window's click must not cancel this panel's reply; fail open while either window id is unknown.
    const windowId = deps.panelWindowId();
    if (msg.windowId !== undefined && windowId !== undefined && msg.windowId !== windowId) return;
    // The mount drain may have seeded this one already; the stop warning would name its own reply.
    if (conversation.ownsRequest(msg.requestId)) return;
    void seedImage(msg.requestId, msg.imageUrl, msg.task, true)
      // Consume the queued copy, or a remount within 60s rebuilds this turn as a stuck spinner.
      .then(() => removePendingImageSeed(msg.requestId))
      .catch((e: unknown) => debugCatch(e, 'sidepanel.onSeedMessage'));
  }

  /** Any surface that fails a translate pushes an audit entry; success entries are filtered upstream. */
  function onAuditAppend(entry: Extract<Msg, { kind: 'audit:append' }>['entry']): void {
    const err = entry.error;
    if (!err) return;
    // This panel's own failures already render inline, so a toast would show the same error twice.
    if (conversation.ownsRequest(entry.requestId)) return;
    // A sibling window's panel renders it inline in its own thread — one copy is enough.
    if (entry.surface === 'sidepanel') return;
    // The code can be one this build does not know: errCodeLabel asserts on the union.
    const code = (ALL_ERR_CODES as readonly string[]).includes(err.code)
      ? (err.code as ErrCode)
      : null;
    const label = code === null ? null : errCodeLabel(code);
    const body =
      label === null || code === 'UNKNOWN'
        ? err.message || errCodeLabel('UNKNOWN')
        : err.message
          ? `${label}: ${err.message}`
          : label;
    const where = auditSurfaceLabel(entry.surface);
    const tab = code === null ? undefined : optionsTabForMessage(err.message, code);
    toastStore.push({
      message: where === null ? body : `${where} — ${body}`,
      variant: 'danger',
      ...(tab !== undefined
        ? { action: { label: 'Open settings', onClick: () => openOptionsTab(tab) } }
        : {}),
    });
  }

  function onRuntimeMessage(raw: unknown, sender?: chrome.runtime.MessageSender): boolean {
    if (!isFromOwnBackground(sender) || !hasKnownKind(raw)) return false;
    // Seed the turn pair before the router streams, or applyChunk finds no matching turn and renders nothing.
    if (raw.kind === 'sidepanel:seed-image-translate') onSeedMessage(raw);
    else if (raw.kind === 'audit:append') onAuditAppend(raw.entry);
    else if (raw.kind === 'translate:chunk') conversation.applyChunk(raw.chunk);
    return false;
  }

  async function drainImageSeeds(windowId: number | undefined): Promise<void> {
    // One inflight slot: each seed takes it from the previous, which lands as Canceled rather than a dead spinner.
    for (const seed of await drainPendingImageSeeds(windowId)) {
      // The live message may hold this one while the panel switches.
      if (conversation.ownsRequest(seed.requestId)) continue;
      await seedImage(seed.requestId, seed.imageUrl, seed.task);
    }
  }

  /** Same argument assembly as the composer, so a handoff ships the page context a typed message does. */
  async function sendHandoff(
    handoff: PendingPopupHandoff,
    kind: Task,
    taskId: TaskId | undefined,
  ): Promise<void> {
    await conversation.send({
      content: handoff.sourceText,
      kind,
      ...(taskId !== undefined ? { taskId } : {}),
      sourceLang: asLangSelection(handoff.sourceLang),
      targetLang: asLangSelection(handoff.targetLang),
      stream: deps.streaming(),
      tone: handoff.tone,
      context: await deps.pageContext(taskId ?? kind),
      ...(handoff.explain ? { explain: handoff.explain } : {}),
      ...(handoff.trimmed ? { trimmedTo: handoff.sourceText.length } : {}),
    });
  }

  /** False when the handoff carries nothing left to land. */
  function noteHandoffLosses(handoff: PendingPopupHandoff): boolean {
    if (handoff.trimmed) {
      toastStore.push({ message: selectionTrimmedMessage('selection'), variant: 'warning' });
    }
    if (!handoff.imageDropped) return true;
    toastStore.push({
      message:
        handoff.ocrText !== undefined
          ? 'The image was too large to open in the side panel, so only the text came through.'
          : 'The image was too large to open in the side panel.',
      variant: 'warning',
    });
    // Nothing but the image placeholder is left; sending it would ask the model to translate "[image]".
    return handoff.ocrText !== undefined || handoff.response !== undefined;
  }

  async function landHandoff(handoff: PendingPopupHandoff): Promise<void> {
    await toTabSite();
    // An unknown or off task runs as Translate and keeps the text; a custom one runs under kind translate with its id.
    const handoffTask: TaskId = deps.runnableTask(handoff.task) ?? 'translate';
    const handoffKind: Task = builtInTask(handoffTask) ?? 'translate';
    const handoffTaskId = builtInTask(handoffTask) === null ? handoffTask : undefined;
    deps.setPickers({
      sourceLang: asLangSelection(handoff.sourceLang),
      targetLang: asLangSelection(handoff.targetLang),
      task: handoffTask,
      tone: handoff.tone,
    });
    // A finished payload (Open-image, a dropped image's OCR text) lands done; Pin re-dispatches below.
    if (
      handoff.response !== undefined ||
      handoff.imageDataUrl !== undefined ||
      handoff.imageDropped === true
    ) {
      conversation.seedDeliveredTurn({
        // An OCR result is not a Task-shaped turn: refine and retry would both no-op on it.
        kind:
          handoff.imageDataUrl === undefined && handoff.imageDropped !== true
            ? handoffKind
            : 'image-translate',
        ...(handoffTaskId !== undefined && handoff.imageDataUrl === undefined
          ? { taskId: handoffTaskId }
          : {}),
        sourceText: handoff.sourceText,
        ...(handoff.trimmed ? { trimmedTo: handoff.sourceText.length } : {}),
        response: handoff.response ?? handoff.ocrText ?? '',
        ...(handoff.reply ? { reply: handoff.reply } : {}),
        ...(handoff.imageDataUrl ? { imageDataUrl: handoff.imageDataUrl } : {}),
        ...(handoff.imageDropped ? { imageDropped: true } : {}),
        sourceLang: asLangSelection(handoff.sourceLang),
        targetLang: asLangSelection(handoff.targetLang),
        stream: deps.streaming(),
        tone: handoff.tone,
      });
      return;
    }
    warnIfStoppingInflight();
    await sendHandoff(handoff, handoffKind, handoffTaskId);
  }

  async function drainPopupHandoffs(): Promise<void> {
    try {
      await deps.firstFollow;
      const before = deps.pickers();
      for (const handoff of await drainPendingPopupHandoff(await getPanelWindowId())) {
        if (handoff.attachImage === true) {
          // A failed tooltip image waits in the composer: the user picks the task, then sends.
          if (!noteHandoffLosses(handoff)) continue;
          const src = handoff.imageDataUrl;
          if (src !== undefined && isSafeRenderImageSrc(src)) deps.attachImage(src);
          continue;
        }
        if (handoff.sourceText.trim().length === 0) continue;
        deps.clearFilters();
        if (!noteHandoffLosses(handoff)) continue;
        await landHandoff(handoff);
      }
      const after = deps.pickers();
      const moved =
        before.sourceLang !== after.sourceLang ||
        before.targetLang !== after.targetLang ||
        before.task !== after.task ||
        before.tone !== after.tone;
      if (!moved) return;
      toastStore.push({
        message: 'Language, task and tone set from your selection',
        variant: 'info',
        action: { label: 'Undo', onClick: () => deps.setPickers(before) },
      });
    } catch (e) {
      debugCatch(e, 'sidepanel.drainPopupHandoffs');
    }
  }

  return { onRuntimeMessage, drainImageSeeds, drainPopupHandoffs };
}
