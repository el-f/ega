import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '@tests/mocks/chrome';
import type { Settings, TranslationChunk } from '@/shared/types';

vi.mock('@/shared/pending-popup-handoff', () => ({
  writePendingPopupHandoff: vi.fn().mockResolvedValue(undefined),
  drainPendingPopupHandoff: vi.fn().mockResolvedValue([]),
  PENDING_POPUP_HANDOFF_KEY: 'ega.pendingPopupHandoff',
  MAX_HANDOFF_AGE_MS: 60_000,
}));

vi.mock('@/background/contextMenu', () => ({
  SITE_TOGGLE_ID: 'ega-toggle-site',
  computeSiteMenuTitle: vi.fn(() => 'Disable Ega on this site'),
  handleSiteToggleClick: vi.fn().mockResolvedValue(undefined),
  refreshSiteToggleLabel: vi.fn().mockResolvedValue(undefined),
  installContextMenus: vi.fn().mockResolvedValue(undefined),
}));

const cancel = vi.fn();
const cancelAll = vi.fn(() => 0);
let emitChunk: ((c: TranslationChunk) => void) | null = null;
// Never settles: the vision call is still running when the tab closes.
const handleImageTranslate = vi.fn(() => new Promise<void>(() => {}));

vi.mock('@/background/router', () => ({
  createRouter: vi.fn(() => ({
    handleTranslate: vi.fn(async (_req: unknown, onChunk: (c: TranslationChunk) => void) => {
      emitChunk = onChunk;
    }),
    handleImageTranslate,
    handleImageExplain: vi.fn(),
    cancel,
    cancelAll,
    clearProbes: vi.fn(),
  })),
}));

vi.mock('@/background/pre-warm', () => ({
  resolvePreWarmProvider: vi.fn().mockReturnValue(null),
}));

vi.mock('@/shared/cli-session/port-manager', () => ({
  getStatus: vi.fn().mockReturnValue('cold'),
  warm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/background/native-test', () => ({ handleNativeTest: vi.fn() }));

vi.mock('@/shared/backends/registry', () => ({
  instantiateAll: vi.fn(() => ({})),
  resolveBackend: vi.fn(),
}));

const settingsStub: Partial<Settings> = {
  contextMenuItems: [],
  contextMenuLayout: 'nested',
  imageTranslateSurface: 'tooltip',
};

vi.mock('@/shared/storage', () => ({
  getSettings: vi.fn().mockResolvedValue(settingsStub),
  getCustomLanguages: vi.fn().mockResolvedValue([]),
  getCustomTasks: vi.fn().mockResolvedValue([]),
  updateSettings: vi.fn().mockResolvedValue(undefined),
  replaceSitePrefs: vi.fn().mockResolvedValue(undefined),
  onSettingsChanged: vi.fn(() => () => {}),
}));

vi.mock('@/background/cache', () => ({
  TranslationCache: vi.fn(function () {
    return {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      generation: vi.fn(() => 0),
    };
  }),
}));

await import('@/background/index');

function startTranslate(requestId: string, tabId: number): void {
  chromeMock.runtime.onMessage.emit(
    {
      kind: 'translate:start',
      requestId,
      text: 'marhaba',
      sourceLang: 'auto',
      targetLang: 'en',
      options: { stream: false, explain: false },
    },
    { id: chromeMock.runtime.id, tab: { id: tabId } } as chrome.runtime.MessageSender,
    () => {},
  );
}

function startImageTranslate(
  requestId: string,
  tabId: number,
  surface?: 'tooltip' | 'sidepanel',
): void {
  chromeMock.runtime.onMessage.emit(
    {
      kind: 'image:translate',
      requestId,
      imageUrl: 'https://i.redd.it/x.png',
      ...(surface ? { surface } : {}),
    },
    { id: chromeMock.runtime.id, tab: { id: tabId, windowId: 1 } } as chrome.runtime.MessageSender,
    () => {},
  );
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

// The image dispatch awaits settings and a storage read before it reaches the router.
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  resetChromeMock();
  vi.clearAllMocks();
  emitChunk = null;
  settingsStub.imageTranslateSurface = 'tooltip';
});

describe('closing a tab cancels the requests it started', () => {
  it('cancels an in-flight request owned by the closed tab', async () => {
    startTranslate('r-open', 9);
    await settle();

    chromeMock.tabs.onRemoved.emit(9, { isWindowClosing: false, windowId: 1 });

    expect(cancel).toHaveBeenCalledWith('r-open');
  });

  it('leaves the requests of a tab that stayed open alone', async () => {
    startTranslate('r-other', 21);
    await settle();

    chromeMock.tabs.onRemoved.emit(22, { isWindowClosing: false, windowId: 1 });

    expect(cancel).not.toHaveBeenCalled();
  });

  it('forgets a request once it has answered, so a later close cancels nothing', async () => {
    startTranslate('r-done', 33);
    await settle();
    emitChunk?.({ type: 'done', requestId: 'r-done', confidence: 1 });

    chromeMock.tabs.onRemoved.emit(33, { isWindowClosing: false, windowId: 1 });

    expect(cancel).not.toHaveBeenCalled();
  });

  it('cancels a tooltip-surface image translate owned by the closed tab', async () => {
    startImageTranslate('img-1', 9);
    await flush();
    expect(handleImageTranslate).toHaveBeenCalledTimes(1);

    chromeMock.tabs.onRemoved.emit(9, { isWindowClosing: false, windowId: 1 });

    expect(cancel).toHaveBeenCalledWith('img-1');
  });

  it('a tooltip Retry stays on the tooltip whatever the stored global says', async () => {
    // The Retry names its own surface; the global "opens in" is no longer shown anywhere.
    settingsStub.imageTranslateSurface = 'sidepanel';
    startImageTranslate('img-retry', 9, 'tooltip');
    await flush();
    expect(handleImageTranslate).toHaveBeenCalledTimes(1);

    chromeMock.tabs.onRemoved.emit(9, { isWindowClosing: false, windowId: 1 });

    expect(cancel).toHaveBeenCalledWith('img-retry');
  });

  it('leaves a side-panel image translate running when its tab closes', async () => {
    settingsStub.imageTranslateSurface = 'sidepanel';
    startImageTranslate('img-2', 9);
    await flush();
    expect(handleImageTranslate).toHaveBeenCalledTimes(1);

    chromeMock.tabs.onRemoved.emit(9, { isWindowClosing: false, windowId: 1 });

    expect(cancel).not.toHaveBeenCalled();
  });
});

describe('a cancel acts only for the request it belongs to', () => {
  const tabSender = (id: number): chrome.runtime.MessageSender =>
    ({
      id: chromeMock.runtime.id,
      tab: { id },
      url: 'https://site.test/page',
    }) as chrome.runtime.MessageSender;
  const panelSender = {
    id: chromeMock.runtime.id,
    url: 'chrome-extension://ega-test/src/sidepanel/index.html',
  } as chrome.runtime.MessageSender;
  // The options page opens in a tab, so it carries sender.tab like a content script does.
  const optionsSender = {
    id: chromeMock.runtime.id,
    tab: { id: 50 },
    url: 'chrome-extension://ega-test/src/options/index.html',
  } as chrome.runtime.MessageSender;

  function send(msg: unknown, sender: chrome.runtime.MessageSender): void {
    chromeMock.runtime.onMessage.emit(msg, sender, () => {});
  }

  it("ignores one tab's cancel of another tab's request", async () => {
    startTranslate('r-mine', 9);
    await settle();
    send({ kind: 'translate:cancel', requestId: 'r-mine' }, tabSender(10));
    expect(cancel).not.toHaveBeenCalled();
  });

  it("honors a tab's cancel of its own request", async () => {
    startTranslate('r-own', 9);
    await settle();
    send({ kind: 'translate:cancel', requestId: 'r-own' }, tabSender(9));
    expect(cancel).toHaveBeenCalledWith('r-own');
  });

  it('lets the side panel cancel its request, which no tab owns', () => {
    send({ kind: 'translate:cancel', requestId: 'r-panel' }, panelSender);
    expect(cancel).toHaveBeenCalledWith('r-panel');
  });

  it('refuses cancel-all from a content script', () => {
    send({ kind: 'translate:cancel-all' }, tabSender(9));
    expect(cancelAll).not.toHaveBeenCalled();
  });

  it('runs cancel-all for an extension page, in a tab or not', () => {
    send({ kind: 'translate:cancel-all' }, panelSender);
    send({ kind: 'translate:cancel-all' }, optionsSender);
    expect(cancelAll).toHaveBeenCalledTimes(2);
  });
});
