import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createRouter } from '@/background/router';
import { dispatchImageTranslate } from '@/background/imageTranslateDispatch';
import { baseDeps } from '@tests/_helpers/router';
import { testManifest } from '@tests/_helpers/backend';
import { asBackendIdUnsafe } from '@/shared/brands';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { TranslateImageArgs, TranslationBackend } from '@/shared/backends/base';
import type { Msg } from '@/shared/messages';
import type { TranslationChunk } from '@/shared/types';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

/** A cloud vision backend: one delta, then its own ABORTED a macrotask after the abort, as fetch rejects. */
function lateAbortVision(): TranslationBackend & { entered: Promise<void> } {
  let signalEntered = (): void => {};
  const entered = new Promise<void>((r) => {
    signalEntered = r;
  });
  return {
    id: asBackendIdUnsafe('anthropic'),
    manifest: testManifest('anthropic', true),
    isAvailable: async () => true,
    entered,
    translate: async () => {},
    translateImage: async (args: TranslateImageArgs) => {
      args.onChunk({ type: 'delta', requestId: args.requestId, text: 'Hal' });
      signalEntered();
      await new Promise<void>((resolve) => {
        args.cancel.signal.addEventListener('abort', () => setTimeout(resolve, 0), { once: true });
      });
      await new Promise((r) => setTimeout(r, 0));
      args.onChunk({
        type: 'error',
        requestId: args.requestId,
        code: 'ABORTED',
        message: 'aborted',
      });
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a cancel the tooltip did not start (Cancel all, Delete all data)', () => {
  it('reaches the tooltip as Stopped, not as a blank finished answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/png', 'content-length': '4' }),
        body: null,
        arrayBuffer: async () => PNG_BYTES.buffer,
      } as unknown as Response),
    );
    const backend = lateAbortVision();
    const chunks: TranslationChunk[] = [];
    const router = createRouter(
      baseDeps({
        backends: [backend],
        getSettings: async () => ({
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'k',
          disabledBackends: [],
          cacheEnabled: false,
        }),
      }),
    );
    const sent: Msg[] = [];
    const run = dispatchImageTranslate({
      tabId: 7,
      imageUrl: 'https://example.com/img.png',
      requestId: 'img-1',
      surface: 'tooltip',
      getSettings: async () => DEFAULT_SETTINGS,
      router: {
        handleImageTranslate: (req, onChunk) =>
          router.handleImageTranslate(req, (c) => {
            chunks.push(c);
            onChunk(c);
          }),
        handleImageExplain: router.handleImageExplain,
      },
      broadcast: () => {},
      sendToTab: (_tab, m) => sent.push(m),
      logger: { error: () => {} },
    });
    await backend.entered;
    expect(router.cancelAll()).toBe(1);
    await run;

    const result = sent.find((m) => m.kind === 'content:image-translate-result');
    expect(result).toMatchObject({ requestId: 'img-1', error: { code: 'ABORTED' } });
    // The backend's own late ABORTED is a duplicate the terminal latch drops.
    expect(chunks.filter((c) => c.type !== 'delta')).toHaveLength(1);
  });

  it('reaches an image request still reading the page, so the image never goes', async () => {
    // A real fetch rejects on an aborted signal before it sends anything.
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        init.signal?.aborted
          ? Promise.reject(new DOMException('aborted', 'AbortError'))
          : Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers({ 'content-type': 'image/png' }),
              body: null,
              arrayBuffer: async () => PNG_BYTES.buffer,
            } as unknown as Response),
      ),
    );
    let answerRead: (reply: unknown) => void = () => {};
    const tabSend = chrome.tabs.sendMessage as unknown as Mock;
    tabSend.mockImplementation((_tabId: number, m: Msg) =>
      m.kind === 'ega:get-page-context'
        ? new Promise((r) => {
            answerRead = r;
          })
        : Promise.resolve({ ok: true }),
    );
    const backend = lateAbortVision();
    const translateImage = vi.spyOn(backend, 'translateImage');
    const settings = {
      ...DEFAULT_SETTINGS,
      anthropicApiKey: 'k',
      disabledBackends: [],
      cacheEnabled: false,
      contextEnabled: true,
    };
    const router = createRouter(
      baseDeps({ backends: [backend], getSettings: async () => settings }),
    );
    const sent: Msg[] = [];
    const run = dispatchImageTranslate({
      tabId: 7,
      imageUrl: 'https://example.com/img.png',
      requestId: 'img-read',
      task: 'explain',
      surface: 'tooltip',
      getSettings: async () => settings,
      router,
      broadcast: () => {},
      sendToTab: (_tab, m) => sent.push(m),
      logger: { error: () => {} },
    });
    await vi.waitFor(() => {
      expect(tabSend).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ kind: 'ega:get-page-context' }),
      );
    });

    expect(router.cancelAll()).toBe(1);
    answerRead({ context: { pageTitle: 'Inbox' } });
    await run;

    expect(translateImage).not.toHaveBeenCalled();
    const result = sent.find((m) => m.kind === 'content:image-translate-result');
    expect(result).toMatchObject({ requestId: 'img-read', error: { code: 'ABORTED' } });
  });
});
