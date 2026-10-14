import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '@tests/mocks/chrome';
import { DEFAULT_CONTEXT_MENU_ITEMS } from '@/shared/context-menu';
import type { Settings } from '@/shared/types';
import type { ImageTranslateDispatchDeps } from '@/background/imageTranslateDispatch';

const writeHandoffMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/shared/pending-popup-handoff', () => ({
  writePendingPopupHandoff: (...a: unknown[]) => writeHandoffMock(...a),
  drainPendingPopupHandoff: vi.fn().mockResolvedValue([]),
  PENDING_POPUP_HANDOFF_KEY: 'ega.pendingPopupHandoff',
  MAX_HANDOFF_AGE_MS: 60_000,
}));

// Stubbing the whole module would skip the `sendToTab` lambda, which is the thing under test.
vi.mock('@/background/imageTranslateDispatch', () => ({
  dispatchImageTranslate: vi.fn(
    (deps: Pick<ImageTranslateDispatchDeps, 'tabId' | 'imageUrl' | 'sendToTab'>) => {
      deps.sendToTab(deps.tabId, {
        kind: 'content:image-translate-pending',
        requestId: 'req-img',
        imageUrl: deps.imageUrl,
      });
      return Promise.resolve();
    },
  ),
}));

vi.mock('@/background/contextMenu', () => ({
  SITE_TOGGLE_ID: 'ega-toggle-site',
  computeSiteMenuTitle: vi.fn(() => 'Disable Ega on this site'),
  handleSiteToggleClick: vi.fn().mockResolvedValue(undefined),
  refreshSiteToggleLabel: vi.fn().mockResolvedValue(undefined),
  installContextMenus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/background/router', () => ({
  createRouter: vi.fn(() => ({ cancel: vi.fn(), cancelAll: vi.fn(), clearProbes: vi.fn() })),
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
  contextMenuItems: DEFAULT_CONTEXT_MENU_ITEMS,

  defaultTargetLang: 'en' as unknown as Settings['defaultTargetLang'],
  defaultTone: 'neutral',
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

const TAB_ID = 42;
const TAB = { id: TAB_ID, url: 'https://example.com', active: true } as chrome.tabs.Tab;

// The exact rejection Chrome raises for a tab whose content script died with the last reload.
const DEAD_TAB = (): Promise<never> =>
  Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));

// Chrome honors sidePanel.open() only inside the click's own task; any await before it expires the gesture.
let inGesture = false;
function emitClick(menuItemId: string, extra: Partial<chrome.contextMenus.OnClickData> = {}): void {
  inGesture = true;
  try {
    chromeMock.contextMenus.onClicked.emit(
      { menuItemId, editable: false, pageUrl: 'https://example.com', ...extra },
      TAB,
    );
  } finally {
    inGesture = false;
  }
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

const RELOAD_HINT = 'Ega cannot reach this page — reload it and try again.';
const WAITING_HINT =
  'Ega cannot reach this page, so your selection went to the side panel. If the panel is closed, open it within a minute, or reload the page and try again.';

beforeEach(() => {
  resetChromeMock();
  vi.clearAllMocks();
  chromeMock.tabs.query.mockResolvedValue([TAB]);
  chromeMock.sidePanel.open.mockImplementation(() =>
    inGesture
      ? Promise.resolve()
      : Promise.reject(
          new Error('`sidePanel.open()` may only be called in response to a user gesture.'),
        ),
  );
});

describe('a tab whose content script died still gets an answer', () => {
  it('parks the selection for the side panel instead of an open() the expired gesture refuses', async () => {
    chromeMock.tabs.sendMessage.mockImplementation(DEAD_TAB);

    emitClick('ega-translate-selection', { selectionText: 'marhaba' });
    await settle();

    expect(writeHandoffMock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceText: 'marhaba', task: 'translate' }),
    );
    expect(chromeMock.sidePanel.open).not.toHaveBeenCalled();
    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ tabId: TAB_ID, text: '!' });
    expect(chromeMock.action.setTitle).toHaveBeenCalledWith({ tabId: TAB_ID, title: WAITING_HINT });
  });

  it('falls back to the plain reload hint when the selection cannot be parked', async () => {
    chromeMock.tabs.sendMessage.mockImplementation(DEAD_TAB);
    writeHandoffMock.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));

    emitClick('ega-translate-selection', { selectionText: 'marhaba' });
    await settle();

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ tabId: TAB_ID, text: '!' });
    expect(chromeMock.action.setTitle).toHaveBeenCalledWith({ tabId: TAB_ID, title: RELOAD_HINT });
  });

  it('leaves a reachable tooltip alone — no handoff, and a stale hint is cleared', async () => {
    chromeMock.tabs.sendMessage.mockResolvedValue({ ok: true });

    emitClick('ega-translate-selection', { selectionText: 'marhaba' });
    await settle();

    expect(writeHandoffMock).not.toHaveBeenCalled();
    expect(chromeMock.action.setBadgeText).not.toHaveBeenCalledWith({ tabId: TAB_ID, text: '!' });
    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ tabId: TAB_ID, text: '' });
  });

  it.each([
    ['ega-translate-page', 'page translate'],
    ['ega-pick-element', 'element picker'],
  ])('badges the tab when %s cannot reach the page', async (menuId) => {
    chromeMock.tabs.sendMessage.mockImplementation(DEAD_TAB);

    emitClick(menuId);
    await settle();

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ tabId: TAB_ID, text: '!' });
    expect(writeHandoffMock).not.toHaveBeenCalled();
  });

  it('badges the tab when a tooltip-surface image translate cannot reach the page', async () => {
    chromeMock.tabs.sendMessage.mockImplementation(DEAD_TAB);

    emitClick('ega-translate-image', { srcUrl: 'https://example.com/a.png' });
    await settle();

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ tabId: TAB_ID, text: '!' });
  });

  it('leaves a reachable tab alone on an image translate', async () => {
    chromeMock.tabs.sendMessage.mockResolvedValue({ ok: true });

    emitClick('ega-translate-image', { srcUrl: 'https://example.com/a.png' });
    await settle();

    expect(chromeMock.action.setBadgeText).not.toHaveBeenCalledWith({ tabId: TAB_ID, text: '!' });
  });

  it('badges the tab when the image:translate runtime path cannot reach the page', async () => {
    chromeMock.tabs.sendMessage.mockImplementation(DEAD_TAB);

    chromeMock.runtime.onMessage.emit(
      { kind: 'image:translate', requestId: 'req-img', imageUrl: 'https://example.com/a.png' },
      { id: 'ega-test', tab: TAB } as chrome.runtime.MessageSender,
      () => {},
    );
    await settle();

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ tabId: TAB_ID, text: '!' });
  });

  it('badges the active tab when the hotkey cannot reach the page', async () => {
    chromeMock.tabs.sendMessage.mockImplementation(DEAD_TAB);

    chromeMock.commands.onCommand.emit('translate-selection');
    await settle();

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ tabId: TAB_ID, text: '!' });
  });

  it('clears the hint once the tab starts loading a new document', () => {
    chromeMock.tabs.onUpdated.emit(TAB_ID, { status: 'loading' }, TAB);

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ tabId: TAB_ID, text: '' });
    expect(chromeMock.action.setTitle).toHaveBeenCalledWith({ tabId: TAB_ID, title: '' });
  });
});

describe('the reload hint only where a reload helps, and never left stale', () => {
  it.each([
    ['no url (a page Ega has no access to)', undefined],
    ['chrome://extensions', 'chrome://extensions/'],
    ['the new-tab page', 'chrome://newtab/'],
  ])('the hotkey on %s shows no reload hint', async (_where, url) => {
    chromeMock.tabs.query.mockResolvedValue([{ id: TAB_ID, active: true, url }]);
    chromeMock.tabs.sendMessage.mockImplementation(DEAD_TAB);

    chromeMock.commands.onCommand.emit('translate-selection');
    await settle();

    expect(chromeMock.tabs.sendMessage).toHaveBeenCalled();
    expect(chromeMock.action.setBadgeText).not.toHaveBeenCalledWith({ tabId: TAB_ID, text: '!' });
  });

  it('the hotkey on a file: page still gets the reload hint', async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: TAB_ID, active: true, url: 'file:///a.html' }]);
    chromeMock.tabs.sendMessage.mockImplementation(DEAD_TAB);

    chromeMock.commands.onCommand.emit('translate-selection');
    await settle();

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ tabId: TAB_ID, text: '!' });
  });

  it('a page hit before its script loaded drops the hint when it finishes loading', async () => {
    chromeMock.tabs.sendMessage.mockImplementation(DEAD_TAB);
    chromeMock.commands.onCommand.emit('translate-selection');
    await settle();
    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ tabId: TAB_ID, text: '!' });

    chromeMock.tabs.onUpdated.emit(TAB_ID, { status: 'complete' }, TAB);

    expect(chromeMock.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: TAB_ID, text: '' });
    expect(chromeMock.action.setTitle).toHaveBeenLastCalledWith({ tabId: TAB_ID, title: '' });
  });

  it('a send that reaches the page clears a hint left from before', async () => {
    chromeMock.tabs.sendMessage.mockResolvedValue({ ok: true });

    chromeMock.commands.onCommand.emit('translate-selection');
    await settle();

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ tabId: TAB_ID, text: '' });
    expect(chromeMock.action.setBadgeText).not.toHaveBeenCalledWith({ tabId: TAB_ID, text: '!' });
  });
});
