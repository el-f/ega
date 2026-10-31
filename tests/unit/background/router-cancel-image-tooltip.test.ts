import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createRouter } from '@/background/router';
import { dispatchImageTranslate } from '@/background/imageTranslateDispatch';
import { baseDeps } from '@tests/_helpers/router';
import { testManifest } from '@tests/_helpers/backend';
import { asBackendIdUnsafe } from '@/shared/brands';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { clearAuditLog, readAuditLog } from '@/shared/audit-log';
import { drainPendingImageSeeds } from '@/shared/pending-image-seed';
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

/** Delete all data in Advanced: Cancel all, then the storage wipe and the audit clear. */
async function deleteAllData(router: { cancelAll: () => number }): Promise<void> {
  expect(router.cancelAll()).toBe(1);
  await chrome.storage.session.clear();
  await chrome.storage.local.clear();
  await clearAuditLog();
}

/** Nothing the wiped run writes may carry the page text: no audit row, no seed, no other key. */
async function expectNoPageTextStored(): Promise<void> {
  // The router writes its audit row without awaiting it; a macrotask lets that write land.
  await new Promise((r) => setTimeout(r, 0));
  expect(await readAuditLog()).toEqual([]);
  expect(JSON.stringify(await chrome.storage.local.get(null))).not.toContain('SECRET');
  expect(await chrome.storage.session.get(null)).toEqual({});
}

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

    await deleteAllData(router);
    answerRead({ context: { pageTitle: 'Inbox', beforeText: 'SECRET text around the image' } });
    await run;

    expect(translateImage).not.toHaveBeenCalled();
    const result = sent.find((m) => m.kind === 'content:image-translate-result');
    expect(result).toMatchObject({ requestId: 'img-read', error: { code: 'ABORTED' } });
    await expectNoPageTextStored();
  });

  it('stops a side-panel request still reading the page from writing its seed after the wipe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))),
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
    const broadcast: Msg[] = [];
    const run = dispatchImageTranslate({
      tabId: 7,
      imageUrl: 'https://example.com/img.png',
      requestId: 'img-sp',
      task: 'explain',
      surface: 'sidepanel',
      windowId: 1,
      getSettings: async () => settings,
      router,
      broadcast: (m) => broadcast.push(m),
      sendToTab: () => {},
      logger: { error: () => {} },
    });
    await vi.waitFor(() => {
      expect(tabSend).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ kind: 'ega:get-page-context' }),
      );
    });

    // Delete all data while the page read is still out.
    await deleteAllData(router);
    answerRead({ context: { pageTitle: 'Inbox', beforeText: 'SECRET text around the image' } });
    await run;

    expect(translateImage).not.toHaveBeenCalled();
    await expectNoPageTextStored();
    // No seed reaches the panel; only the terminal ABORTED goes out.
    expect(broadcast).toEqual([
      {
        kind: 'translate:chunk',
        chunk: expect.objectContaining({ type: 'error', requestId: 'img-sp', code: 'ABORTED' }),
      },
    ]);
  });

  it('removes a seed whose write waited on a draining panel past the wipe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))),
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
    const broadcast: Msg[] = [];
    const run = dispatchImageTranslate({
      tabId: 7,
      imageUrl: 'https://example.com/img.png',
      requestId: 'img-lock',
      task: 'explain',
      surface: 'sidepanel',
      windowId: 1,
      getSettings: async () => settings,
      router,
      broadcast: (m) => broadcast.push(m),
      sendToTab: () => {},
      logger: { error: () => {} },
    });
    await vi.waitFor(() => {
      expect(tabSend).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ kind: 'ega:get-page-context' }),
      );
    });

    // The panel the same click opened drains on mount and holds the seed lock while it reads.
    let releaseDrain: () => void = () => {};
    const held = new Promise<Record<string, unknown>>((r) => {
      releaseDrain = () => r({});
    });
    // The callback overload types get() as void; this read is the promise form.
    const promiseArea = chrome.storage.session as unknown as { get: () => Promise<unknown> };
    const sessionGet = vi.spyOn(promiseArea, 'get').mockReturnValueOnce(held);
    const drain = drainPendingImageSeeds(1);
    answerRead({ context: { pageTitle: 'Inbox', beforeText: 'SECRET text around the image' } });
    // Dispatch passes its cancel check and waits on the lock to write the seed.
    await new Promise((r) => setTimeout(r, 0));
    await deleteAllData(router);
    releaseDrain();
    await drain;
    await run;
    sessionGet.mockRestore();

    expect(translateImage).not.toHaveBeenCalled();
    await expectNoPageTextStored();
    expect(broadcast).toEqual([
      {
        kind: 'translate:chunk',
        chunk: expect.objectContaining({ type: 'error', requestId: 'img-lock', code: 'ABORTED' }),
      },
    ]);
  });

  it('writes no audit row for a run the wipe caught in its first router reads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))),
    );
    const tabSend = chrome.tabs.sendMessage as unknown as Mock;
    tabSend.mockImplementation((_tabId: number, m: Msg) =>
      Promise.resolve(
        m.kind === 'ega:get-page-context'
          ? { context: { pageTitle: 'Inbox', beforeText: 'SECRET text around the image' } }
          : { ok: true },
      ),
    );
    const settings = {
      ...DEFAULT_SETTINGS,
      anthropicApiKey: 'k',
      disabledBackends: [],
      cacheEnabled: false,
      contextEnabled: true,
    };
    // The router's first settings read waits: dispatch has passed its last cancel check by then.
    let releaseRead: () => void = () => {};
    const readHeld = new Promise<void>((r) => {
      releaseRead = r;
    });
    let signalRead: () => void = () => {};
    const readStarted = new Promise<void>((r) => {
      signalRead = r;
    });
    let routerReads = 0;
    const router = createRouter(
      baseDeps({
        backends: [lateAbortVision()],
        getSettings: async () => {
          routerReads += 1;
          if (routerReads === 1) {
            signalRead();
            await readHeld;
          }
          return settings;
        },
      }),
    );
    // A fixed clock, so the wipe lands strictly after the run started and not in the same millisecond.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const sent: Msg[] = [];
      const run = dispatchImageTranslate({
        tabId: 7,
        imageUrl: 'https://example.com/img.png',
        requestId: 'img-reads',
        task: 'explain',
        surface: 'tooltip',
        getSettings: async () => settings,
        router,
        broadcast: () => {},
        sendToTab: (_tab, m) => sent.push(m),
        logger: { error: () => {} },
      });
      await readStarted;

      vi.setSystemTime(Date.now() + 1);
      await deleteAllData(router);
      releaseRead();
      await run;

      const result = sent.find((m) => m.kind === 'content:image-translate-result');
      expect(result).toMatchObject({ requestId: 'img-reads', error: { code: 'ABORTED' } });
      await expectNoPageTextStored();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a Clear of the request list while an image request reads the page', () => {
  it('drops the run audit row, which would hold the page text', async () => {
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
    let answerRead: (reply: unknown) => void = () => {};
    let signalRead: () => void = () => {};
    const readStarted = new Promise<void>((r) => {
      signalRead = r;
    });
    const tabSend = chrome.tabs.sendMessage as unknown as Mock;
    tabSend.mockImplementation((_tabId: number, m: Msg) => {
      if (m.kind !== 'ega:get-page-context') return Promise.resolve({ ok: true });
      signalRead();
      return new Promise((r) => {
        answerRead = r;
      });
    });
    const backend: TranslationBackend = {
      id: asBackendIdUnsafe('anthropic'),
      manifest: testManifest('anthropic', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: async (args: TranslateImageArgs) => {
        args.onChunk({ type: 'delta', requestId: args.requestId, text: 'Hello' });
        args.onChunk({ type: 'done', requestId: args.requestId });
      },
    };
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
    // A fixed clock, so the Clear lands strictly after the request started and not in the same millisecond.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const sent: Msg[] = [];
      const run = dispatchImageTranslate({
        tabId: 7,
        imageUrl: 'https://example.com/img.png',
        requestId: 'img-clear',
        task: 'explain',
        surface: 'tooltip',
        getSettings: async () => settings,
        router,
        broadcast: () => {},
        sendToTab: (_tab, m) => sent.push(m),
        logger: { error: () => {} },
      });
      await readStarted;

      vi.setSystemTime(Date.now() + 1);
      // The Clear button sends audit:clear alone, with no Cancel all.
      await clearAuditLog();
      answerRead({ context: { pageTitle: 'Inbox', beforeText: 'SECRET text around the image' } });
      await run;

      // A Clear stops no request: the answer still reaches the tooltip.
      const result = sent.find((m) => m.kind === 'content:image-translate-result');
      expect(result).toMatchObject({ requestId: 'img-clear', translation: 'Hello' });
      // The router writes its audit row without awaiting it; a macrotask lets that write land.
      await new Promise((r) => setTimeout(r, 0));
      expect(await readAuditLog()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
