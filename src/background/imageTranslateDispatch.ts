import type { TaskId } from '@/shared/task-view';
import { sendTabMsg, type Msg } from '@/shared/messages';
import type { AuditSurface } from '@/shared/audit-log';
import type { MenuSurface } from '@/shared/context-menu';
import type { ErrCode, PageContext, Settings, TranslationChunk } from '@/shared/types';
import { enqueuePendingImageSeed, removePendingImageSeed } from '@/shared/pending-image-seed';
import { boundPageContext } from '@/shared/page-context-bounds';
import { debugCatch } from '@/shared/logger';

/** A page whose main thread is busy answers late; past this the image goes without page info. */
const PAGE_CONTEXT_READ_TIMEOUT_MS = 1000;

interface VisionRequest {
  id: string;
  imageUrl: string;
  task?: TaskId;
  context?: PageContext;
  pageHost?: string;
}

export interface ImageTranslateDispatchDeps {
  tabId: number;
  imageUrl: string;
  /** Omit to have dispatch generate one. */
  requestId?: string;
  task?: TaskId;
  /** The clicked menu item's surface, or the tooltip Retry's. Only the e2e hook omits it and gets `Settings.imageTranslateSurface`. */
  surface?: MenuSurface;
  /** Browser window of the click; the side-panel seed is scoped to it. */
  windowId?: number;
  /** Host of the tab, so site rules match as they do for a text request. */
  pageHost?: string;
  getSettings: () => Promise<Settings>;
  router: {
    handleImageTranslate: (
      req: VisionRequest,
      onChunk: (c: TranslationChunk) => void,
      meta: { surface: AuditSurface },
    ) => Promise<void>;
    handleImageExplain: (
      req: VisionRequest,
      onChunk: (c: TranslationChunk) => void,
      meta: { surface: AuditSurface },
    ) => Promise<void>;
  };
  broadcast: (msg: Msg) => void;
  sendToTab: (tabId: number, msg: Msg) => void;
  /** Ties a tooltip-surface request to its tab so a tab close cancels it; returns the release. */
  trackTab?: (requestId: string) => () => void;
  logger: { error: (msg: string, err: unknown) => void };
}

/** The request's `surface` picks between streaming to the side panel and one buffered result to the tab. */
export async function dispatchImageTranslate(deps: ImageTranslateDispatchDeps): Promise<void> {
  const { tabId, imageUrl, getSettings, router, broadcast, sendToTab, logger } = deps;
  const settings = await getSettings();
  const surface = deps.surface ?? settings.imageTranslateSurface;
  const requestId = deps.requestId ?? crypto.randomUUID();
  const task = deps.task ?? 'translate';
  const runVision = task === 'explain' ? router.handleImageExplain : router.handleImageTranslate;
  const windowScope = deps.windowId !== undefined ? { windowId: deps.windowId } : {};
  // The built-in image prompt takes no page info, so Translate never asks; an extension page has no tab to ask.
  const context =
    task !== 'translate' && settings.contextEnabled && tabId >= 0
      ? await readImageContext(tabId, imageUrl, settings.pageContextLevel)
      : undefined;
  const sentContext = context ? { context } : {};
  const req: VisionRequest = {
    id: requestId,
    imageUrl,
    ...(task !== 'translate' && task !== 'explain' ? { task } : {}),
    ...sentContext,
    ...(deps.pageHost !== undefined ? { pageHost: deps.pageHost } : {}),
  };

  if (surface === 'sidepanel') {
    // Queue as well as broadcast: a panel still opening drains the queue on mount.
    await enqueuePendingImageSeed({
      requestId,
      imageUrl,
      task,
      ...sentContext,
      ...windowScope,
    }).catch(() => {});
    broadcast({
      kind: 'sidepanel:seed-image-translate',
      requestId,
      imageUrl,
      task,
      ...sentContext,
      ...windowScope,
    });
    let failed = false;
    try {
      await runVision(
        req,
        (chunk) => {
          if (chunk.type === 'error') failed = true;
          broadcast({ kind: 'translate:chunk', chunk });
        },
        // The panel that seeded it shows a failure inline; another window's panel must not toast it again.
        { surface: 'sidepanel' },
      );
    } catch (e) {
      failed = true;
      logger.error('image translate (menu) failed', e);
      // runVision threw without a terminal chunk; the seeded turn would spin forever.
      broadcast({
        kind: 'translate:chunk',
        chunk: {
          type: 'error',
          requestId,
          code: 'UNKNOWN',
          message: e instanceof Error ? e.message : String(e),
        },
      });
    }
    // A finished stream's chunks are gone, so a panel opening later would rebuild a turn nothing can finish.
    // A failed one keeps the seed: a panel still mounting then shows the turn and its stall notice, not a blank.
    if (!failed) await removePendingImageSeed(requestId).catch(() => {});
  } else {
    // Vision calls run for seconds; the tab mounts its loading tooltip on this message.
    sendToTab(tabId, { kind: 'content:image-translate-pending', requestId, imageUrl, task });
    let buffered = '';
    let done: Extract<TranslationChunk, { type: 'done' }> | undefined;
    let streamError: { code: ErrCode; message: string; retryAfterMs?: number } | undefined;
    // The side-panel branch never registers: the panel outlives the tab.
    const releaseTab = deps.trackTab?.(requestId);
    try {
      await runVision(
        req,
        (chunk) => {
          if (chunk.type === 'delta') buffered = chunk.replace ? chunk.text : buffered + chunk.text;
          if (chunk.type === 'done') done = chunk;
          if (chunk.type === 'error') {
            streamError = {
              code: chunk.code,
              message: chunk.message,
              ...(chunk.retryAfterMs !== undefined ? { retryAfterMs: chunk.retryAfterMs } : {}),
            };
          }
        },
        { surface: 'content' },
      );
    } catch (e) {
      logger.error('image translate (menu/tooltip) failed', e);
      streamError = {
        code: 'UNKNOWN',
        message: e instanceof Error ? e.message : String(e),
      };
    } finally {
      releaseTab?.();
    }
    if (streamError !== undefined) {
      sendToTab(tabId, {
        kind: 'content:image-translate-result',
        requestId,
        translation: '',
        imageUrl,
        task,
        error: streamError,
      });
    } else {
      const conf = done?.confidence;
      sendToTab(tabId, {
        kind: 'content:image-translate-result',
        requestId,
        translation: done?.text ?? buffered,
        ...(conf !== undefined ? { confidence: conf } : {}),
        ...(done?.detectedLang !== undefined ? { detectedLang: done.detectedLang } : {}),
        ...(done?.detectedDetail !== undefined ? { detectedDetail: done.detectedDetail } : {}),
        ...(done?.detectedLangs !== undefined ? { detectedLangs: done.detectedLangs } : {}),
        ...(done?.explain !== undefined ? { explain: done.explain } : {}),
        ...(done?.notes !== undefined ? { notes: done.notes } : {}),
        ...(done?.details !== undefined ? { details: done.details } : {}),
        ...(done?.answer !== undefined ? { answer: done.answer } : {}),
        ...(done?.meta !== undefined ? { meta: done.meta } : {}),
        ...(done?.usedImage === true ? { usedImage: true } : {}),
        ...sentContext,
        imageUrl,
        task,
      });
    }
  }
}

/** The tab's page context anchored at the image, cut and type-checked; undefined when the tab gives none. */
async function readImageContext(
  tabId: number,
  imageUrl: string,
  level: 'minimal' | 'rich',
): Promise<PageContext | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), PAGE_CONTEXT_READ_TIMEOUT_MS);
    });
    const reply = await Promise.race([
      sendTabMsg(tabId, { kind: 'ega:get-page-context', level, imageUrl }),
      late,
    ]);
    const context = boundPageContext(reply?.context);
    return context && Object.keys(context).length > 0 ? context : undefined;
  } catch (e) {
    // No content script (the tab needs a reload) or the tab closed: the image still goes, with no page info.
    debugCatch(e, 'bg.image.pageContext');
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
