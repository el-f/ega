import './stored-changes-boot';
import { getShadowHostElement, onShadowHostMounted } from './shadowHost';
import { installTestHooks } from './testHooks';
import { getSelectionInfo, isEditableRange } from './selection';
import { isSensitiveRange, isSensitiveTarget, selectionIsSensitive } from './safety';
import { showBubble, hideBubble, loadBubbleMenu } from './bubble';
import { looksLikeEnglish } from './looks-like-english';
import { installSelectionRestore, uninstallSelectionRestore } from './selection-restore';
import * as accum from './accumulator';
import { openTooltip, finishTooltipDirect, errorTooltip, closeTooltip } from './lazy-tooltip';
import { detectLang, resolveSourceLang } from './detect';
import { maybeShowSmartBannerOnce, cancelSmartBannerPoll } from './banner-flows';
import {
  shouldShowBubbleWithReason,
  shouldShowBubbleWithReasonAsync,
  smartMinLength,
} from './should-show-bubble';
import { matchShortcut } from './hotkey';
import {
  collectPageContext,
  collectPageLevelContext,
  type CollectPageContextTunables,
} from './page-context-collector';
import { perfStart, perfDump, perfRecord } from '@/shared/perf-timings';
import { enterPickerMode as enterPickerModeImpl, teardownPicker } from './picker-overlay';
import {
  beginRequest,
  endRequest,
  pending,
  perfTimers,
  releaseRequest,
  rendererFor,
  rendererOwner,
  settleStream,
  setStopStreamHook,
  type PendingReq,
} from './request-state';
import { omitUndef } from '@/shared/utils/omitUndef';
import {
  fireTranslate,
  buildTooltipOpenOpts,
  openOptionsFromContent,
  reportEntryFailure,
  sendFromEntry,
  showReloadToast,
  type HandlerDeps,
} from './translate-handlers';

import type * as PageV2Mod from './page-translate-v2';
let pageV2ModP: Promise<typeof PageV2Mod> | null = null;
function lazyPageV2(): Promise<typeof PageV2Mod> {
  return (pageV2ModP ??= import('./page-translate-v2'));
}

import type * as InlineMod from './inlineReplace';
let inlineModP: Promise<typeof InlineMod> | null = null;
function lazyInline(): Promise<typeof InlineMod> {
  return (inlineModP ??= import('./inlineReplace'));
}

import { uuid } from '@/shared/uuid';
import { asLangSelection } from '@/shared/brands';
import { debugCatch } from '@/shared/logger';
import {
  ensureSettings,
  currentSettings,
  preloadSettings,
  watchSettings,
  onSettingsUpdate,
} from './settings-cache';
import { mirrorTheme } from '@/shared/theme-apply';
import {
  ensureCustomLanguages,
  ensureCustomTasks,
  installCustomLanguagesInvalidator,
} from './customs-cache';
import {
  hasKnownKind,
  isFromOwnBackground,
  type HeldBack,
  type Msg,
  type MsgReply,
} from '@/shared/messages';
import type { LangSelection, TranslationChunk, Settings } from '@/shared/types';
import { runnableDefaultTask, type ImageTask } from '@/shared/task-prompts';
import type { TaskId } from '@/shared/task-view';
import { MAX_SELECTION_CHARS, RECENT_SELECTION_TTL_MS } from '@/shared/constants';
import { resolveEffective } from '@/shared/site-profile';
import { closeStickyToast, showToast } from './toast';
import { imageStuckTimeoutMs, stuckTimeoutMs } from '@/shared/stuck-timeout';
import { isExtensionContextValid } from './context-guard';

// Component CSS is not web-accessible, so the host page cannot load it and the preload helper would kill the real import(); a lost JS chunk still throws, which is what the reload toast needs.
window.addEventListener('vite:preloadError', (e) => {
  const payload = (e as Event & { payload?: unknown }).payload;
  if (payload instanceof Error && payload.message.startsWith('Unable to preload CSS')) {
    e.preventDefault();
  }
});

preloadSettings();

watchSettings();

installCustomLanguagesInvalidator();

let stopTheme: (() => void) | null = null;
// From the settings cache and the page's own data-theme: the shared theme helper would load the storage reader.
function mirrorThemeOn(h: HTMLDivElement): void {
  stopTheme?.();
  const mirror = (): void => mirrorTheme(h, currentSettings()?.theme ?? null);
  // First, from the cache, on this frame.
  mirror();
  void ensureSettings()
    .then(mirror)
    .catch((e: unknown) => debugCatch(e, 'content.mirrorTheme'));
  const off = onSettingsUpdate(mirror);
  const observer = new MutationObserver(mirror);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  stopTheme = () => {
    off();
    observer.disconnect();
  };
}
// Nothing mounts the host here: most pages never show any Ega UI, and a mount costs a shadow root plus a stylesheet parse on every page the user visits. getContainer() builds it on the first bubble, tooltip, toast or overlay, and every later remount re-runs this mirror.
onShadowHostMounted(mirrorThemeOn);
installTestHooks();

interface EgaWindow extends Window {
  __egaPerfDump?: () => string;
}
(window as EgaWindow).__egaPerfDump = () => JSON.stringify(perfDump(), null, 2);

/** Every path that would move page text off the page checks the site switch first, and says so with a way back. */
export function showSiteOffToast(): void {
  // The notice and its Turn on live with the bubble menu's chunk: a site-off page is rare.
  void loadBubbleMenu()
    .then((m) => m.showSiteOffToast())
    .catch((e: unknown) => reportEntryFailure(e, 'content.siteOffToast'));
}

/** Sync so the two pull handlers can answer in the same tick. A null cache means the
 *  boot read has not landed, and an unknown answer must not be read as "site is on". */
function siteIsOff(): boolean {
  const s = currentSettings();
  return s === null || resolveEffective(s, location.origin).disabled;
}

/** A cheap early exit for per-event work; a cold cache answers false and the caller's own async gate decides. */
function siteKnownOff(): boolean {
  const s = currentSettings();
  return s !== null && resolveEffective(s, location.origin).disabled;
}

/** The last selection that passed the gates, kept in this page only: opening the popup drops the live one. */
let recentSelection: { text: string; at: number; heldBack?: HeldBack; range?: Range } | null = null;
function rememberSelectionForPopup(text: string): void {
  recentSelection = { text, at: Date.now() };
}

function recentSelectionFresh(): typeof recentSelection {
  if (recentSelection === null || Date.now() - recentSelection.at > RECENT_SELECTION_TTL_MS) {
    return null;
  }
  return recentSelection;
}

/** Why the bubble stayed hidden, while the selection it was about is still the one the user sees. */
function heldBackForPopup(): HeldBack | undefined {
  const kept = recentSelectionFresh();
  if (kept?.heldBack === undefined) return undefined;
  const live = window.getSelection()?.toString() ?? '';
  return live === '' || live === kept.text ? kept.heldBack : undefined;
}

/** What the popup may prefill: the live selection, else one the page dropped in the last minute. */
function selectionForPopup(): string {
  const sel = window.getSelection();
  const live = sel?.toString() ?? '';
  if (live !== '') {
    // The live selection skips the gates the kept one passed, so it gets them here.
    const range = sel !== null && sel.rangeCount > 0 ? sel.getRangeAt(0) : undefined;
    if (selectionIsSensitive(range, document.activeElement)) return '';
    return live.length > MAX_SELECTION_CHARS ? live.slice(0, MAX_SELECTION_CHARS) : live;
  }
  return recentSelectionFresh()?.text ?? '';
}

// Chrome fires an empty selectionchange right after a visibility change, so the restore re-asserts.
installSelectionRestore(siteKnownOff);

// pagehide covers the browsers that skip beforeunload on a cross-origin navigation.
function teardownPageV2(): void {
  if (!pageV2ModP) return;
  void lazyPageV2().then(({ cancelPageTranslateV2 }) => cancelPageTranslateV2());
}
window.addEventListener('beforeunload', teardownPageV2);
window.addEventListener('pagehide', teardownPageV2);

let selectionChangeSeq = 0;
let firstRunPatchedFor: Settings | null = null;
function isLatestSelectionChange(seq: number): boolean {
  return seq === selectionChangeSeq;
}

/** The page owns `localStorage`; blocked-storage and sandboxed documents throw on the property access itself. */
function isDebugFlagEnabled(): boolean {
  try {
    return globalThis.localStorage.getItem('ega-debug') === '1';
  } catch {
    return false;
  }
}

function handleSelectionChange(): void {
  if (!isExtensionContextValid()) {
    teardownContent();
    armReloadHint();
    return;
  }
  const seq = ++selectionChangeSeq;
  if (siteKnownOff()) {
    hideBubble();
    return;
  }
  // The bubble path needs only text + rect; the context slice waits for a real translate.
  (async () => {
    const info = getSelectionInfo(undefined, false);
    if (!info) {
      if (isLatestSelectionChange(seq)) hideBubble();
      return;
    }
    if (isSensitiveRange(info.range) || isSensitiveTarget(document.activeElement)) {
      if (isLatestSelectionChange(seq)) hideBubble();
      return;
    }
    // Every consumer below is bounded: a Ctrl+A selection is megabytes and no path needs more than the cap.
    const overCap = info.text.length > MAX_SELECTION_CHARS;
    const capped = overCap ? info.text.slice(0, MAX_SELECTION_CHARS) : info.text;
    const s = await ensureSettings();
    if (!isLatestSelectionChange(seq)) return;
    const eff = resolveEffective(s, location.origin);
    if (eff.disabled) {
      hideBubble();
      return;
    }
    // After the gate, before every other one: opening the popup drops focus and clears the live selection.
    rememberSelectionForPopup(capped);
    // Selections past the translate cap skip the detection battery — the bubble has nothing sane to offer them.
    if (overCap) {
      hideBubble();
      return;
    }
    const customs = await ensureCustomLanguages();
    if (!isLatestSelectionChange(seq)) return;
    const decision = await shouldShowBubbleWithReasonAsync({ text: capped }, s, customs);
    if (!isLatestSelectionChange(seq)) return;
    if (isDebugFlagEnabled()) {
      console.debug('[ega] bubble shown:', decision.show, decision.reason, capped.slice(0, 40));
    }
    if (!decision.show) {
      hideBubble();
      if (
        recentSelection !== null &&
        (decision.reason === 'english' ||
          decision.reason === 'too-short' ||
          decision.reason === 'mode-never')
      ) {
        recentSelection.heldBack = {
          reason: decision.reason,
          ...(decision.reason === 'too-short'
            ? { minLength: smartMinLength(capped.trim(), s) }
            : {}),
        };
        recentSelection.range = info.range.cloneRange();
      }
      maybeShowSmartBannerOnce(s);
      return;
    }
    const isFirstRun = !s.bubbleFirstRunSeen;
    // A drag fires many selectionchange ticks before the stored write comes back; write once per settings read.
    if (isFirstRun && firstRunPatchedFor !== s) {
      firstRunPatchedFor = s;
      void chrome.runtime
        .sendMessage({
          kind: 'settings:update',
          patch: { bubbleFirstRunSeen: true },
        })
        .catch(() => (firstRunPatchedFor = null));
    }
    // Re-detect for the pill: a matched variety beats showing a permanent `auto→en`.
    const displayDirection =
      eff.direction.source === 'auto'
        ? {
            source: detectLang(info.text, { settings: s, customs })?.id ?? 'auto',
            target: eff.direction.target,
          }
        : eff.direction;
    const block = info.range.commonAncestorContainer;
    const blockEl = block instanceof Element ? block : block.parentElement;
    showBubble({
      rect: info.rect,
      ...(blockEl && getComputedStyle(blockEl).direction === 'rtl' ? { rtl: true } : {}),
      queued: accum.size(),
      direction: displayDirection,
      ...(isFirstRun ? { firstRun: true } : {}),
      onClick: (e) => {
        void handleBubbleClick(e, info).catch((err) =>
          reportEntryFailure(err, 'content.bubbleClick'),
        );
      },
    });
  })().catch((e) => debugCatch(e, 'content.selectionchange'));
}
document.addEventListener('selectionchange', handleSelectionChange);

function handleKeydown(e: KeyboardEvent): void {
  if (!isUserGesture(e)) return;
  if (!isExtensionContextValid()) {
    teardownContent();
    armReloadHint(e);
    return;
  }
  (async () => {
    const s = await ensureSettings();
    if (matchShortcut(e, s.shortcut)) {
      e.preventDefault();
      void startTranslateSelection();
      return;
    }
    if (s.pickerEnabled && matchShortcut(e, s.pickerShortcut)) {
      e.preventDefault();
      void enterPickerMode();
    }
  })().catch((err) => debugCatch(err, 'content.keydown'));
}
document.addEventListener('keydown', handleKeydown);

// After an extension update the injected script keeps running with a dead chrome.runtime.
function teardownContent(): void {
  document.removeEventListener('selectionchange', handleSelectionChange);
  document.removeEventListener('keydown', handleKeydown);
  uninstallUrlWatcher();
  window.removeEventListener('beforeunload', teardownPageV2);
  window.removeEventListener('pagehide', teardownPageV2);
  uninstallSelectionRestore();
  cancelSmartBannerPoll();
  recentSelection = null;
  teardownPicker();
  teardownPageV2();
  if (inlineModP) void inlineModP.then((m) => m.teardownInline());
  stopTheme?.();
  closeTooltip();
  hideBubble();
  getShadowHostElement()?.remove();
}

let reloadHintArmed = false;

/** Teardown usually runs on a stray caret move, so one listener waits for the first gesture that expected Ega. */
function armReloadHint(trigger?: KeyboardEvent): void {
  const s = currentSettings();
  if (reloadHintArmed || s === null || resolveEffective(s, location.origin).disabled) return;
  reloadHintArmed = true;
  const isShortcut = (e: KeyboardEvent): boolean =>
    isUserGesture(e) && matchShortcut(e, s.shortcut);
  const show = (): void => {
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKey);
    showReloadToast();
  };
  const onMouseUp = (): void => {
    const text = window.getSelection()?.toString() ?? '';
    if (shouldShowBubbleWithReason({ text }, s, []).show) show();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (isShortcut(e)) show();
  };
  if (trigger && isShortcut(trigger)) {
    show();
    return;
  }
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKey);
}

/** Rect of the clicked image when it is still in the DOM; viewport-center fallback otherwise. */
export function imageAnchorRect(imageUrl: string): DOMRect {
  for (const img of Array.from(document.images)) {
    if (img.currentSrc === imageUrl || img.src === imageUrl) {
      const r = img.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return r;
    }
  }
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  return {
    left: cx - 50,
    top: cy - 10,
    right: cx + 50,
    bottom: cy + 10,
    x: cx - 50,
    y: cy - 10,
    width: 100,
    height: 20,
    toJSON: () => ({}),
  } as DOMRect;
}

/** The tooltip display settings an image tooltip honours, like a text one. */
function imageTipDisplay(): { clickOutsideDismiss: boolean; draggable: boolean } {
  const s = currentSettings();
  return {
    clickOutsideDismiss: s?.tooltipClickOutside ?? true,
    draggable: s?.tooltipDraggable ?? false,
  };
}

// Mounts the loading tooltip the moment the background starts the vision call.
export function handleImageTranslatePending(
  msg: Extract<Msg, { kind: 'content:image-translate-pending' }>,
): void {
  closeStickyToast();
  // Ending the request drops its owner row, so a late vision result finds nobody to paint for.
  const cancel = (): void => endRequest(msg.requestId, 'cancel');
  // Registering before the open makes the vision call a normal tooltip request: a newer one cancels it.
  beginRequest(msg.requestId, 'tooltip');
  openTooltip({
    requestId: msg.requestId,
    srcText: '',
    rect: imageAnchorRect(msg.imageUrl),
    confidencePill: false,
    imageUrl: msg.imageUrl,
    ...imageTipDisplay(),
    ...omitUndef({ task: msg.task }),
    stuckTimeoutMs: imageStuckTimeoutMs(currentSettings()),
    onCancel: cancel,
    onClose: cancel,
  });
}

/** Re-runs the same vision arm under a fresh id; the background answers with a new pending + result pair.
 *  Only a tooltip-surface request lands in this tooltip, so the retry stays on the tooltip. */
function retryImageTranslate(imageUrl: string, task?: ImageTask): void {
  sendFromEntry(
    {
      kind: 'image:translate',
      requestId: uuid(),
      imageUrl,
      surface: 'tooltip',
      ...(task !== undefined ? { task } : {}),
    },
    'content.imageRetry',
  );
}

export function handleImageTranslateResult(
  msg: Extract<Msg, { kind: 'content:image-translate-result' }>,
): void {
  // A cancel or a newer tooltip already took the surface, so this vision answer is stale.
  if (!rendererOwner.has(msg.requestId)) return;
  // The result tooltip is not a request: its Retry mints a new one, and nothing streams into it.
  releaseRequest(msg.requestId);
  const rect = imageAnchorRect(msg.imageUrl);
  const onRetry = (): void => retryImageTranslate(msg.imageUrl, msg.task);

  if (msg.error) {
    openTooltip({
      requestId: msg.requestId,
      srcText: '',
      rect,
      confidencePill: false,
      imageUrl: msg.imageUrl,
      ...imageTipDisplay(),
      ...omitUndef({ contextTask: msg.task }),
      onRetry,
      onOpenOptions: openOptionsFromContent,
    });
    errorTooltip(msg.requestId, msg.error);
    return;
  }

  const s = currentSettings();
  openTooltip({
    requestId: msg.requestId,
    srcText: '',
    rect,
    confidencePill: s?.confidencePill ?? true,
    ...omitUndef({ confidencePillThreshold: s?.confidencePillThreshold }),
    imageUrl: msg.imageUrl,
    ...imageTipDisplay(),
    ...omitUndef({ contextTask: msg.task }),
    onRetry,
  });
  // One buffered result: set the body verbatim instead of feeding the JSON accumulator.
  finishTooltipDirect(
    msg.requestId,
    msg.translation,
    msg.confidence,
    omitUndef({
      explain: msg.explain,
      detectedLang: msg.detectedLang,
      detectedDetail: msg.detectedDetail,
      detectedLangs: msg.detectedLangs,
      usedImage: msg.usedImage,
    }),
  );
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Every branch below assumes the message came from this extension's own service worker.
  if (!isFromOwnBackground(sender)) return false;
  const a = msg as { kind?: string; text?: string; task?: TaskId; targetLang?: LangSelection };
  if (a.kind === 'hotkey:translate' || a.kind === 'ctx:translate-selection') {
    const stop = perfStart('input.to_translate_selection');
    const trigger = a.kind;
    void startTranslateSelection(a.text, a.task, a.targetLang)
      .catch((e) => reportEntryFailure(e, 'content.translateSelection'))
      .finally(() => stop({ trigger }));
    sendResponse({ ok: true } satisfies MsgReply['hotkey:translate']);
    return true;
  }
  if (a.kind === 'picker:enter') {
    void (async () => {
      const s = await ensureSettings();
      if (s.pickerEnabled) await enterPickerMode();
    })().catch((e) => reportEntryFailure(e, 'content.picker.enter'));
    sendResponse({ ok: true } satisfies MsgReply['picker:enter']);
    return true;
  }
  if (a.kind === 'ega:get-selection') {
    // Answer in the same tick: opening the popup clears focus and the live selection.
    try {
      const off = siteIsOff();
      const heldBack = off ? undefined : heldBackForPopup();
      sendResponse({
        text: off ? '' : selectionForPopup(),
        ...(heldBack ? { heldBack } : {}),
      } satisfies MsgReply['ega:get-selection']);
    } catch (e) {
      debugCatch(e, 'content.getSelection');
      sendResponse({ text: '' } satisfies MsgReply['ega:get-selection']);
    }
    return false;
  }
  if (a.kind === 'ega:get-page-context') {
    if (siteIsOff()) {
      sendResponse({ context: null } satisfies MsgReply['ega:get-page-context']);
      return false;
    }
    const level = (msg as { level?: unknown }).level;
    const allowed: ReadonlySet<unknown> = new Set(['minimal', 'rich']);
    const safeLevel: 'minimal' | 'rich' = allowed.has(level)
      ? (level as 'minimal' | 'rich')
      : 'minimal';
    const s: Settings | null = currentSettings();
    try {
      const tunables: CollectPageContextTunables = {};
      if (s?.descriptionContextCap !== undefined)
        tunables.descriptionContextCap = s.descriptionContextCap;
      if (s?.headingTrailDepth !== undefined) tunables.headingTrailDepth = s.headingTrailDepth;
      if (s?.headingTrailEntryCap !== undefined)
        tunables.headingTrailEntryCap = s.headingTrailEntryCap;
      const context = collectPageLevelContext(safeLevel, document, location, tunables);
      sendResponse({ context } satisfies MsgReply['ega:get-page-context']);
    } catch (e) {
      debugCatch(e, 'content.collectPageLevelContext');
      sendResponse({ context: null } satisfies MsgReply['ega:get-page-context']);
    }
    return false;
  }
  if (hasKnownKind(msg)) {
    const m = msg as Msg;
    if (m.kind === 'translate:chunk') {
      handleChunk(m.chunk);
    } else if (m.kind === 'page:translateAll' || m.kind === 'page:chooseAreas') {
      void dispatchPageTranslate(m.kind === 'page:translateAll' ? 'whole' : 'areas').catch((e) =>
        reportEntryFailure(e, 'content.pageTranslate'),
      );
      sendResponse({ ok: true } satisfies MsgReply['page:translateAll' | 'page:chooseAreas']);
      return true;
    } else if (m.kind === 'content:image-translate-pending') {
      handleImageTranslatePending(m);
      sendResponse({ ok: true } satisfies MsgReply['content:image-translate-pending']);
      return true;
    } else if (m.kind === 'content:image-translate-result') {
      handleImageTranslateResult(m);
      sendResponse({ ok: true } satisfies MsgReply['content:image-translate-result']);
      return true;
    }
  }
  return false;
});

const handlerDeps: HandlerDeps = { ensureSettings };

/** Translate page runs the whole page; Choose areas opens area picking. */
async function dispatchPageTranslate(scope: 'whole' | 'areas'): Promise<void> {
  closeStickyToast();
  hideBubble();
  const settings = await ensureSettings();
  const eff = resolveEffective(settings, location.origin);
  if (eff.disabled) {
    showSiteOffToast();
    return;
  }
  const mod = await lazyPageV2();
  const { showBatchProgress } = await import('./batch-progress');

  const detectOpts = { settings, customs: await ensureCustomLanguages() };
  const run = scope === 'whole' ? mod.runWholePageTranslate : mod.runPageTranslateV2;
  await run({
    getSettings: ensureSettings,
    detectLang: (text) => detectLang(text, detectOpts)?.id,
    dispatch: async (requestId, text, detectedLang) => {
      const s = await ensureSettings();
      // `detectedLang` is already a variety id — feeding it back through the detector resolves every block to 'auto'.
      const sourceLang =
        detectedLang !== undefined && eff.direction.source === 'auto'
          ? asLangSelection(detectedLang)
          : resolveSourceLang(text, eff.direction.source, detectOpts);
      await chrome.runtime.sendMessage({
        kind: 'translate:start',
        requestId,
        text,
        sourceLang,
        targetLang: eff.direction.target,
        options: { stream: s.streaming, explain: false, batch: true },
      } satisfies Msg);
    },
    onRegister: (requestId) => beginRequest(requestId, 'page-v2'),
    onUnregister: releaseRequest,
    cancelRequest: (requestId) => endRequest(requestId, 'page-teardown'),
    mountProgress: (total, onCancel) => showBatchProgress(total, onCancel),
    target: eff.direction.target,
    looksLikeEnglish,
  });
}

export async function startTranslateText(
  text: string,
  rect: DOMRect,
  ctx?: { beforeText?: string; afterText?: string },
  range?: Range,
  directionOverride?: { source: LangSelection; target: LangSelection },
  forceInline = false,
  taskOverride?: TaskId,
): Promise<void> {
  hideBubble();
  const s = await ensureSettings();
  const eff = resolveEffective(s, location.origin);
  if (eff.disabled) {
    showSiteOffToast();
    return;
  }
  const trimmed = text.length > MAX_SELECTION_CHARS ? text.slice(0, MAX_SELECTION_CHARS) : text;
  const reqId = uuid();
  const direction = directionOverride ?? eff.direction;
  // The tooltip's task list reads the custom rows synchronously, so they load before it opens.
  const [customs] = await Promise.all([ensureCustomLanguages(), ensureCustomTasks()]);
  const sourceLang: LangSelection = resolveSourceLang(trimmed, direction.source, {
    settings: s,
    customs,
  });
  // Everything downstream gets the resolved source: swapping a raw 'auto' would make it the target.
  const resolvedDirection = { source: sourceLang, target: direction.target };
  // `contextEnabled` is the authoritative off-switch; skip collection entirely when false.
  const collected = s.contextEnabled
    ? collectPageContext(
        {
          ...omitUndef({ beforeText: ctx?.beforeText, afterText: ctx?.afterText }),
          ...(range ? { anchorNode: range.commonAncestorContainer } : {}),
        },
        s.pageContextLevel,
        document,
        location,
        omitUndef({
          descriptionContextCap: s.descriptionContextCap,
          headingTrailDepth: s.headingTrailDepth,
          headingTrailEntryCap: s.headingTrailEntryCap,
        }),
      )
    : {};
  const context = Object.keys(collected).length > 0 ? collected : undefined;
  const req: PendingReq = {
    id: reqId,
    text: trimmed,
    rect,
    sourceLang,
    targetLang: direction.target,
    direction: resolvedDirection,
    requestedDirection: direction,
    ...(context ? { context } : {}),
    ...(range ? { range } : {}),
    task: taskOverride ?? runnableDefaultTask(s),
    tone: s.defaultTone,
  };
  pending.set(reqId, req);
  // A form-control or contenteditable selection would be destroyed by inline replace; force the tooltip.
  const wantsInline =
    (forceInline || eff.displayMode === 'inline') && !!range && !isEditableRange(range);
  let usedInline = false;
  if (wantsInline && !isRangeInsideInlineWrapper(range)) {
    const { openInline } = await lazyInline();
    usedInline = openInline({ requestId: reqId, range, stuckTimeoutMs: stuckTimeoutMs(s) });
  }
  // openInline registers itself as the owner; the tooltip must register first so its own supersede sweep skips this request and cancels the rest.
  if (!usedInline) {
    beginRequest(reqId, 'tooltip');
    openTooltip(buildTooltipOpenOpts(handlerDeps, s, req));
  }
  await fireTranslate(req, false, s.streaming);
}

async function handleBubbleClick(
  e: MouseEvent,
  info: NonNullable<ReturnType<typeof getSelectionInfo>>,
): Promise<void> {
  // Shift alone queues; Shift with another modifier falls through to a normal translate.
  if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    accum.add({ text: info.text, rect: info.rect });
    hideBubble();
    if (!queueExplained) {
      queueExplained = true;
      showToast('Added to the queue. Select more text, then click Translate to send it all.');
    }
    return;
  }
  await startTranslateSelection();
}

/** The first Shift-click on this page says what the queue is; the label's count carries it after that. */
let queueExplained = false;

/** The popup's Translate anyway names a selection the popup itself cleared; anchor on the kept range. */
function keptSelectionInfo(text: string | undefined): ReturnType<typeof getSelectionInfo> {
  const kept = recentSelectionFresh();
  if (text === undefined || kept?.range === undefined || kept.text !== text) return null;
  const rect = kept.range.getBoundingClientRect();
  if (rect.width + rect.height === 0) return null;
  return { text, rect, range: kept.range, beforeText: '', afterText: '' };
}

async function startTranslateSelection(
  overrideText?: string,
  taskOverride?: TaskId,
  targetLangOverride?: LangSelection,
): Promise<void> {
  closeStickyToast();
  const s = currentSettings();
  const directionOverride: { source: LangSelection; target: LangSelection } | undefined =
    targetLangOverride !== undefined ? { source: 'auto', target: targetLangOverride } : undefined;
  const info = getSelectionInfo(s?.selectionContextCap) ?? keptSelectionInfo(overrideText);
  if (selectionIsSensitive(info?.range, document.activeElement)) {
    hideBubble();
    showToast("Ega doesn't read password, card or code fields.");
    return;
  }
  const queued = accum.list();
  if (queued.length > 0) {
    // Use last entry's rect plus current selection (if any) for tooltip anchor.
    const currentText = overrideText ?? info?.text ?? '';
    const currentRect = info?.rect;
    const parts = [...queued.map((q) => q.text), ...(currentText ? [currentText] : [])];
    if (parts.length === 0) {
      accum.clear();
      return;
    }
    const { text: joined, dropped } = accum.joinCapped(parts, MAX_SELECTION_CHARS);
    const lastQueued = queued[queued.length - 1];
    const anchorRect = currentRect ?? lastQueued?.rect;
    if (!anchorRect) {
      accum.clear();
      return;
    }
    accum.clear();
    if (dropped > 0) {
      showToast(
        `Sent ${parts.length - dropped} of ${parts.length} selections. The rest didn't fit.`,
      );
    }
    await startTranslateText(
      joined,
      anchorRect,
      undefined,
      undefined,
      directionOverride,
      false,
      taskOverride,
    );
    return;
  }

  const rawText = overrideText ?? info?.text;
  if (!rawText) {
    showToast('Select some text first, then press the shortcut.');
    return;
  }
  const text =
    rawText.length > MAX_SELECTION_CHARS ? rawText.slice(0, MAX_SELECTION_CHARS) : rawText;
  const rect =
    info?.rect ??
    ({
      left: 40,
      top: 40,
      right: 120,
      bottom: 60,
      width: 80,
      height: 20,
      x: 40,
      y: 40,
      toJSON: () => ({}),
    } as DOMRect);
  const ctxArg: { beforeText?: string; afterText?: string } = {};
  if (info?.beforeText !== undefined) ctxArg.beforeText = info.beforeText;
  if (info?.afterText !== undefined) ctxArg.afterText = info.afterText;
  await startTranslateText(text, rect, ctxArg, info?.range, directionOverride, false, taskOverride);
}

async function sendCancel(id: string): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ kind: 'translate:cancel', requestId: id } satisfies Msg);
  } catch (e) {
    debugCatch(e, 'content.cancelTranslate');
  }
}

setStopStreamHook((id) => void sendCancel(id));

import { maybeMemoDirection } from './memo-direction';
import { isUserGesture } from './user-gesture';

function isRangeInsideInlineWrapper(range: Range): boolean {
  let n: Node | null = range.commonAncestorContainer;
  while (n) {
    if (n.nodeType === Node.ELEMENT_NODE && (n as Element).hasAttribute('data-ega-replaced')) {
      return true;
    }
    n = n.parentNode;
  }
  return false;
}

function handleChunk(c: TranslationChunk): void {
  const renderer = rendererFor(c.requestId);
  const pt = perfTimers.get(c.requestId);
  if (c.type === 'delta') {
    if (pt?.firstDelta === null) {
      pt.firstDelta = performance.now();
      perfRecord('translate.start_to_first_delta', pt.firstDelta - pt.startedAt);
    }
    renderer?.append(c.requestId, c.text);
    return;
  }
  settleStream(c.requestId);
  if (pt) {
    const elapsed = performance.now() - pt.startedAt;
    if (c.type === 'done') perfRecord('translate.start_to_done', elapsed, { ok: true });
    else perfRecord('translate.start_to_error', elapsed, { ok: false, code: c.code });
    perfTimers.delete(c.requestId);
  }
  if (c.type === 'error') {
    renderer?.error(c.requestId, c);
    return;
  }
  // Fire-and-forget: renderer update must not block on the storage write.
  const req = pending.get(c.requestId);
  // The requested pair, not the detected one: memoizing a detection pins that language on the site and skips detection from then on.
  if (req) void maybeMemoDirection(req.requestedDirection ?? req.direction);
  renderer?.finish(c.requestId, c);
}

export async function enterPickerMode(): Promise<void> {
  closeStickyToast();
  hideBubble();
  closeTooltip();
  const eff = resolveEffective(await ensureSettings(), location.origin);
  if (eff.disabled) {
    showSiteOffToast();
    return;
  }
  await enterPickerModeImpl((text, rect) => {
    closeStickyToast();
    void startTranslateText(text, rect).catch((e) => reportEntryFailure(e, 'content.picker.pick'));
  });
}

/** An SPA route change tears out the nodes the tooltip and the inline wrappers are anchored to. */
function cancelTranslatesOnNav(): void {
  closeStickyToast();
  for (const [reqId, owner] of rendererOwner) {
    // page-v2 runs its own watcher, and a settled inline wrapper keeps no owner entry.
    if (owner === 'tooltip' || owner === 'inline') endRequest(reqId, 'nav');
  }
  closeTooltip();
}

/** The page's own router changed the route: a notice that waits for the user is out of date, the tooltip is not (D41). */
function onRouteChange(e: NavigationCurrentEntryChangeEvent): void {
  if (e.navigationType === 'push' || e.navigationType === 'traverse') closeStickyToast();
}

// A pushState patch made here would live in the isolated world the page's router never calls; the Navigation API reports to every world.
const pageNavigation = (window as { navigation?: Navigation }).navigation;

function installUrlWatcher(): void {
  window.addEventListener('popstate', cancelTranslatesOnNav);
  window.addEventListener('hashchange', cancelTranslatesOnNav);
  pageNavigation?.addEventListener('currententrychange', onRouteChange);
}

function uninstallUrlWatcher(): void {
  window.removeEventListener('popstate', cancelTranslatesOnNav);
  window.removeEventListener('hashchange', cancelTranslatesOnNav);
  pageNavigation?.removeEventListener('currententrychange', onRouteChange);
}

installUrlWatcher();

// Last on purpose: set only when every install above ran. The boot-health e2e reads it because the shadow host mounts lazily, so its presence does not prove boot.
document.documentElement.setAttribute('data-ega-content-booted', '');
