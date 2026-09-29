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
    cancelAll: vi.fn(() => 0),
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

vi.mock('@/background/describe-change', () => ({ describeChange: vi.fn() }));
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

function startImageTranslate(requestId: string, tabId: number): void {
  chromeMock.runtime.onMessage.emit(
    { kind: 'image:translate', requestId, imageUrl: 'https://i.redd.it/x.png' },
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

  it('leaves a side-panel image translate running when its tab closes', async () => {
    settingsStub.imageTranslateSurface = 'sidepanel';
    startImageTranslate('img-2', 9);
    await flush();
    expect(handleImageTranslate).toHaveBeenCalledTimes(1);

    chromeMock.tabs.onRemoved.emit(9, { isWindowClosing: false, windowId: 1 });

    expect(cancel).not.toHaveBeenCalled();
  });
});
