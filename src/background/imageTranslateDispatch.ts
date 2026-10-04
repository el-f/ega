import type { Msg } from '@/shared/messages';
import type { MenuSurface } from '@/shared/context-menu';
import type { ErrCode, Settings, TranslationChunk } from '@/shared/types';
import { enqueuePendingImageSeed, removePendingImageSeed } from '@/shared/pending-image-seed';
import { extractDetectedFields, parseJsonResponse } from '@/shared/backends/base';
import type { ImageTask } from '@/shared/task-prompts';

export interface ImageTranslateDispatchDeps {
  tabId: number;
  imageUrl: string;
  /** Omit to have dispatch generate one. */
  requestId?: string;
  task?: ImageTask;
  /** Per-item override from the clicked menu entry. Omit to use `Settings.imageTranslateSurface`. */
  surface?: MenuSurface;
  /** Browser window of the click; the side-panel seed is scoped to it. */
  windowId?: number;
  getSettings: () => Promise<Settings>;
  router: {
    handleImageTranslate: (
      req: { id: string; imageUrl: string },
      onChunk: (c: TranslationChunk) => void,
    ) => Promise<void>;
    handleImageExplain: (
      req: { id: string; imageUrl: string },
      onChunk: (c: TranslationChunk) => void,
    ) => Promise<void>;
  };
  broadcast: (msg: Msg) => void;
  sendToTab: (tabId: number, msg: Msg) => void;
  /** Ties a tooltip-surface request to its tab so a tab close cancels it; returns the release. */
  trackTab?: (requestId: string) => () => void;
  logger: { error: (msg: string, err: unknown) => void };
}

/** The clicked menu item's `surface`, else `Settings.imageTranslateSurface`, picks between streaming to the side panel and one buffered result to the tab. */
export async function dispatchImageTranslate(deps: ImageTranslateDispatchDeps): Promise<void> {
  const { tabId, imageUrl, getSettings, router, broadcast, sendToTab, logger } = deps;
  const settings = await getSettings();
  const surface = deps.surface ?? settings.imageTranslateSurface;
  const requestId = deps.requestId ?? crypto.randomUUID();
  const task = deps.task ?? 'translate';
  const runVision = task === 'explain' ? router.handleImageExplain : router.handleImageTranslate;
  const windowScope = deps.windowId !== undefined ? { windowId: deps.windowId } : {};

  if (surface === 'sidepanel') {
    // Queue as well as broadcast: a panel still opening drains the queue on mount.
    await enqueuePendingImageSeed({ requestId, imageUrl, task, ...windowScope }).catch(() => {});
    broadcast({
      kind: 'sidepanel:seed-image-translate',
      requestId,
      imageUrl,
      task,
      ...windowScope,
    });
    let failed = false;
    try {
      await runVision({ id: requestId, imageUrl }, (chunk) => {
        if (chunk.type === 'error') failed = true;
        broadcast({ kind: 'translate:chunk', chunk });
      });
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
      await runVision({ id: requestId, imageUrl }, (chunk) => {
        if (chunk.type === 'delta') buffered += chunk.text;
        if (chunk.type === 'done') done = chunk;
        if (chunk.type === 'error') {
          streamError = {
            code: chunk.code,
            message: chunk.message,
            ...(chunk.retryAfterMs !== undefined ? { retryAfterMs: chunk.retryAfterMs } : {}),
          };
        }
      });
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
      // Backends wrap the text in a JSON envelope; the tooltip must not show it raw.
      const parsed = parseJsonResponse(buffered);
      const conf = done?.confidence ?? parsed.confidence;
      sendToTab(tabId, {
        kind: 'content:image-translate-result',
        requestId,
        translation: parsed.translation,
        ...(conf !== undefined ? { confidence: conf } : {}),
        ...extractDetectedFields(parsed, done ?? {}),
        ...(done?.usedImage === true ? { usedImage: true } : {}),
        imageUrl,
        task,
      });
    }
  }
}
