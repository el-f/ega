import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock, MockInstance } from 'vitest';
import { createRouter, type RouterDeps } from '@/background/router';
import { dispatchImageTranslate } from '@/background/imageTranslateDispatch';
import type { TranslateImageArgs, TranslationBackend } from '@/shared/backends/base';
import type { Settings, TranslationChunk } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { baseDeps as routerDeps } from '@tests/_helpers/router';

const bid = (s: string) => asBackendIdUnsafe(s);

// Minimal image-translate backend that emits delta + done.
function mkImageBackend(): TranslationBackend {
  return {
    id: bid('anthropic'),
    manifest: testManifest('anthropic', true),
    isAvailable: async () => true,
    translate: async () => {},
    translateImage: async (a: TranslateImageArgs) => {
      a.onChunk({ type: 'delta', requestId: a.requestId, text: 'Hello' });
      a.onChunk({ type: 'done', requestId: a.requestId, confidence: 0.9 });
    },
  };
}

// translateImage reads `this` like the cloud backends, so an unbound call throws.
function mkThisBoundImageBackend(): TranslationBackend {
  return {
    id: bid('anthropic'),
    manifest: testManifest('anthropic', true),
    isAvailable: async () => true,
    translate: async () => {},
    marker: 'bound',
    async translateImage(this: { marker?: string }, a: TranslateImageArgs) {
      // Unbound, `this` is undefined and this.marker throws TypeError — which
      // is exactly the unbound-call failure this test guards against.
      if (this.marker !== 'bound') {
        throw new TypeError('translateImage called unbound — this lost');
      }
      a.onChunk({ type: 'delta', requestId: a.requestId, text: 'IMGOK' });
      a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
    },
  } as unknown as TranslationBackend;
}

function mkSettings(patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    anthropicApiKey: 'k',
    ...patch,
  };
}

function baseDeps(patch: Partial<RouterDeps> = {}): RouterDeps {
  return routerDeps({
    backends: [mkImageBackend()],
    getSettings: async () => mkSettings(),
    ...patch,
  });
}

const IMAGE_URL = 'https://example.com/img.png';
let uuidSpy: MockInstance;
// The real signature promises a hyphenated UUID; the tests only need a stable id.
const uuid = (s: string) => s as ReturnType<Crypto['randomUUID']>;

beforeEach(() => {
  // Stub fetch so the router's image-fetch path succeeds.
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new Uint8Array(10), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
    ),
  );
  // Only randomUUID: the router hashes the prompt inputs through crypto.subtle.
  uuidSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue(uuid('test-uuid'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  uuidSpy.mockRestore();
});

describe('image-translate surface routing', () => {
  it('emits sidepanel:seed-image-translate when imageTranslateSurface === "sidepanel"', async () => {
    const broadcast = vi.fn();
    const sendToTab = vi.fn();
    const router = createRouter(
      baseDeps({
        getSettings: async () => mkSettings({ imageTranslateSurface: 'sidepanel' }),
      }),
    );

    const sessionSet = vi.spyOn(chrome.storage.session, 'set');
    await dispatchImageTranslate({
      tabId: 1,
      imageUrl: IMAGE_URL,
      getSettings: async () => mkSettings({ imageTranslateSurface: 'sidepanel' }),
      router,
      broadcast,
      sendToTab,
      logger: { error: vi.fn() },
    });

    const seedMsg = broadcast.mock.calls
      .map(([msg]) => msg)
      .find((msg) => msg.kind === 'sidepanel:seed-image-translate');
    expect(seedMsg).toMatchObject({
      kind: 'sidepanel:seed-image-translate',
      requestId: 'test-uuid',
      imageUrl: IMAGE_URL,
    });
    // Queued in session storage while the stream runs, so a panel opening mid-stream finds the seed on
    // mount; removed once the stream ends, or a later panel would rebuild a turn nothing can finish.
    expect(sessionSet).toHaveBeenCalledWith(
      expect.objectContaining({
        'ega.pendingImageSeed': expect.objectContaining({
          'test-uuid': expect.objectContaining({ requestId: 'test-uuid', imageUrl: IMAGE_URL }),
        }),
      }),
    );
    const stored = await chrome.storage.session.get('ega.pendingImageSeed');
    expect(stored['ega.pendingImageSeed']).toBeUndefined();
  });

  it('an explicit tooltip surface overrides a sidepanel global', async () => {
    const broadcast = vi.fn();
    const sendToTab = vi.fn();
    const getSettings = async (): Promise<Settings> =>
      mkSettings({ imageTranslateSurface: 'sidepanel' });
    const router = createRouter(baseDeps({ getSettings }));

    await dispatchImageTranslate({
      tabId: 1,
      imageUrl: IMAGE_URL,
      surface: 'tooltip',
      getSettings,
      router,
      broadcast,
      sendToTab,
      logger: { error: vi.fn() },
    });

    expect(broadcast.mock.calls.some(([m]) => m.kind === 'sidepanel:seed-image-translate')).toBe(
      false,
    );
    expect(sendToTab).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ kind: 'content:image-translate-result' }),
    );
  });

  it('an explicit sidepanel surface overrides a tooltip global', async () => {
    const broadcast = vi.fn();
    const sendToTab = vi.fn();
    const getSettings = async (): Promise<Settings> =>
      mkSettings({ imageTranslateSurface: 'tooltip' });
    const router = createRouter(baseDeps({ getSettings }));

    await dispatchImageTranslate({
      tabId: 1,
      imageUrl: IMAGE_URL,
      surface: 'sidepanel',
      getSettings,
      router,
      broadcast,
      sendToTab,
      logger: { error: vi.fn() },
    });

    expect(broadcast.mock.calls.some(([m]) => m.kind === 'sidepanel:seed-image-translate')).toBe(
      true,
    );
    expect(sendToTab).not.toHaveBeenCalled();
  });

  it('falls back to the global when no per-item surface is given', async () => {
    const broadcast = vi.fn();
    const sendToTab = vi.fn();
    const getSettings = async (): Promise<Settings> =>
      mkSettings({ imageTranslateSurface: 'tooltip' });
    const router = createRouter(baseDeps({ getSettings }));

    await dispatchImageTranslate({
      tabId: 1,
      imageUrl: IMAGE_URL,
      getSettings,
      router,
      broadcast,
      sendToTab,
      logger: { error: vi.fn() },
    });

    expect(sendToTab).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ kind: 'content:image-translate-result' }),
    );
  });

  it('two same-tick dispatches both survive in the keyed map (no overwrite)', async () => {
    const broadcast = vi.fn();
    const sendToTab = vi.fn();
    const router = createRouter(
      baseDeps({
        getSettings: async () => mkSettings({ imageTranslateSurface: 'sidepanel' }),
      }),
    );

    // randomUUID runs AFTER `await getSettings()`, so a counter-based
    // stub mints distinct ids regardless of resolution order.
    const sessionSet = vi.spyOn(chrome.storage.session, 'set');
    let n = 0;
    uuidSpy.mockImplementation(() => uuid(`req-${++n}`));
    const p1 = dispatchImageTranslate({
      tabId: 1,
      imageUrl: 'https://example.com/a.png',
      getSettings: async () => mkSettings({ imageTranslateSurface: 'sidepanel' }),
      router,
      broadcast,
      sendToTab,
      logger: { error: vi.fn() },
    });
    const p2 = dispatchImageTranslate({
      tabId: 1,
      imageUrl: 'https://example.com/b.png',
      getSettings: async () => mkSettings({ imageTranslateSurface: 'sidepanel' }),
      router,
      broadcast,
      sendToTab,
      logger: { error: vi.fn() },
    });
    await Promise.all([p1, p2]);

    // Both seeds sat in the map at once while their streams ran; each stream end removes its own.
    const maps = sessionSet.mock.calls
      .map((c) => (c[0] as Record<string, unknown>)['ega.pendingImageSeed'])
      .filter((m): m is Record<string, { imageUrl: string }> => m !== undefined);
    expect(maps.some((m) => m['req-1'] !== undefined && m['req-2'] !== undefined)).toBe(true);
    expect(maps.some((m) => m['req-1']?.imageUrl === 'https://example.com/a.png')).toBe(true);
    expect(maps.some((m) => m['req-2']?.imageUrl === 'https://example.com/b.png')).toBe(true);
    const stored = await chrome.storage.session.get('ega.pendingImageSeed');
    expect(stored['ega.pendingImageSeed']).toBeUndefined();
  });

  it('fetches the image with redirect:manual so a 302 cannot escape the SSRF guard', async () => {
    const router = createRouter(
      baseDeps({ getSettings: async () => mkSettings({ imageTranslateSurface: 'tooltip' }) }),
    );
    await dispatchImageTranslate({
      tabId: 1,
      imageUrl: IMAGE_URL,
      getSettings: async () => mkSettings({ imageTranslateSurface: 'tooltip' }),
      router,
      broadcast: vi.fn(),
      sendToTab: vi.fn(),
      logger: { error: vi.fn() },
    });
    const fetchMock = globalThis.fetch as unknown as Mock;
    const imageCall = fetchMock.mock.calls.find((c) => c[0] === IMAGE_URL);
    expect(imageCall).toBeDefined();
    expect(imageCall?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('does NOT emit sidepanel seed when imageTranslateSurface === "tooltip"', async () => {
    const broadcast = vi.fn();
    const sendToTab = vi.fn();
    const router = createRouter(
      baseDeps({
        getSettings: async () => mkSettings({ imageTranslateSurface: 'tooltip' }),
      }),
    );

    await dispatchImageTranslate({
      tabId: 1,
      imageUrl: IMAGE_URL,
      getSettings: async () => mkSettings({ imageTranslateSurface: 'tooltip' }),
      router,
      broadcast,
      sendToTab,
      logger: { error: vi.fn() },
    });

    const seedCall = broadcast.mock.calls.find(
      ([msg]) => msg.kind === 'sidepanel:seed-image-translate',
    );
    expect(seedCall).toBeUndefined();
  });

  it('sends content:image-translate-result to originating tab when surface === "tooltip"', async () => {
    const broadcast = vi.fn();
    const sendToTab = vi.fn();
    const router = createRouter(
      baseDeps({
        getSettings: async () => mkSettings({ imageTranslateSurface: 'tooltip' }),
      }),
    );

    await dispatchImageTranslate({
      tabId: 42,
      imageUrl: IMAGE_URL,
      getSettings: async () => mkSettings({ imageTranslateSurface: 'tooltip' }),
      router,
      broadcast,
      sendToTab,
      logger: { error: vi.fn() },
    });

    expect(sendToTab.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ kind: 'content:image-translate-pending' }),
    );
    expect(sendToTab).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        kind: 'content:image-translate-result',
        requestId: 'test-uuid',
        translation: 'Hello',
        confidence: 0.9,
        imageUrl: IMAGE_URL,
      }),
    );
  });

  it('calls translateImage bound — a this-reading backend method does not lose this', async () => {
    const broadcast = vi.fn();
    const sendToTab = vi.fn();
    const router = createRouter(
      baseDeps({
        backends: [mkThisBoundImageBackend()],
        getSettings: async () => mkSettings({ imageTranslateSurface: 'tooltip' }),
      }),
    );

    await dispatchImageTranslate({
      tabId: 7,
      imageUrl: IMAGE_URL,
      getSettings: async () => mkSettings({ imageTranslateSurface: 'tooltip' }),
      router,
      broadcast,
      sendToTab,
      logger: { error: vi.fn() },
    });

    // If the router extracted translateImage unbound, the method's `this`
    // check throws and no successful result is sent.
    expect(sendToTab.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ kind: 'content:image-translate-pending' }),
    );
    expect(sendToTab).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ kind: 'content:image-translate-result', translation: 'IMGOK' }),
    );
  });

  it('tooltip surface parses JSON envelope and emits the extracted translation', async () => {
    // Production backends ship a JSON envelope; prior tooltip path
    // forwarded `buffered` verbatim → tooltip rendered the literal JSON.
    const broadcast = vi.fn();
    const sendToTab = vi.fn();
    const router = {
      handleImageTranslate: async (
        req: { id: string; imageUrl: string },
        onChunk: (c: TranslationChunk) => void,
      ) => {
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: '{"translation":"abc","confidence":0.42}',
        });
        onChunk({ type: 'done', requestId: req.id, confidence: 0.42 });
      },
      handleImageExplain: async () => {},
    };

    await dispatchImageTranslate({
      tabId: 1,
      imageUrl: IMAGE_URL,
      getSettings: async () => mkSettings({ imageTranslateSurface: 'tooltip' }),
      router,
      broadcast,
      sendToTab,
      logger: { error: vi.fn() },
    });

    expect(sendToTab.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ kind: 'content:image-translate-pending' }),
    );
    const sentPayload = sendToTab.mock.calls.at(-1)?.[1] as {
      translation: string;
      confidence: number;
    };
    expect(sentPayload.translation).toBe('abc');
    expect(sentPayload.confidence).toBeCloseTo(0.42, 2);
  });

  it('surfaces error chunk via content:image-translate-result (tooltip surface)', async () => {
    const broadcast = vi.fn();
    const sendToTab = vi.fn();
    const logger = { error: vi.fn() };

    // Router whose handleImageTranslate emits an error chunk and resolves.
    // Same shape as a backend NETWORK/AUTH/PARSE error reaching dispatch.
    const errorEmittingRouter = {
      handleImageTranslate: async (
        req: { id: string; imageUrl: string },
        onChunk: (c: TranslationChunk) => void,
      ) => {
        onChunk({
          type: 'error',
          requestId: req.id,
          code: 'NETWORK',
          message: 'OCR backend offline',
        });
      },
      handleImageExplain: async () => {},
    };

    await dispatchImageTranslate({
      tabId: 11,
      imageUrl: IMAGE_URL,
      getSettings: async () => mkSettings({ imageTranslateSurface: 'tooltip' }),
      router: errorEmittingRouter,
      broadcast,
      sendToTab,
      logger,
    });

    expect(sendToTab.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ kind: 'content:image-translate-pending' }),
    );
    expect(sendToTab).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        kind: 'content:image-translate-result',
        requestId: 'test-uuid',
        translation: '',
        imageUrl: IMAGE_URL,
        error: expect.objectContaining({
          code: 'NETWORK',
          message: 'OCR backend offline',
        }),
      }),
    );
  });

  it('sends content:image-translate-result with error envelope when router rejects (tooltip surface)', async () => {
    const broadcast = vi.fn();
    const sendToTab = vi.fn();
    const logger = { error: vi.fn() };

    // Router whose handleImageTranslate rejects.
    const rejectingRouter = {
      handleImageTranslate: async (_req: unknown, _onChunk: unknown) => {
        throw new Error('backend unavailable');
      },
      handleImageExplain: async () => {},
    };

    await dispatchImageTranslate({
      tabId: 7,
      imageUrl: IMAGE_URL,
      getSettings: async () => mkSettings({ imageTranslateSurface: 'tooltip' }),
      router: rejectingRouter,
      broadcast,
      sendToTab,
      logger,
    });

    expect(sendToTab.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ kind: 'content:image-translate-pending' }),
    );
    expect(sendToTab).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        kind: 'content:image-translate-result',
        requestId: 'test-uuid',
        translation: '',
        imageUrl: IMAGE_URL,
        error: expect.objectContaining({
          code: 'UNKNOWN',
          message: 'backend unavailable',
        }),
      }),
    );
    // Error must have been logged.
    expect(logger.error).toHaveBeenCalled();
    // No sidepanel seed on tooltip path.
    expect(broadcast).not.toHaveBeenCalled();
  });
});
