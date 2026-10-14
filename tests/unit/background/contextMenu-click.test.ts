import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, resetChromeMock } from '@tests/mocks/chrome';
import { DEFAULT_CONTEXT_MENU_ITEMS, type ContextMenuItem } from '@/shared/context-menu';
import { withEncodedMenuIds } from '@/shared/context-menu-ids';
import type { Settings } from '@/shared/types';
import { flushAsync } from '@tests/_helpers/async';

// Must mock heavy deps before the module import so the SW boot code
// doesn't try to call real chrome APIs or spawn native sessions.

const writeHandoffMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/shared/pending-popup-handoff', () => ({
  writePendingPopupHandoff: (...a: unknown[]) => writeHandoffMock(...a),
  drainPendingPopupHandoff: vi.fn().mockResolvedValue([]),
  PENDING_POPUP_HANDOFF_KEY: 'ega.pendingPopupHandoff',
  MAX_HANDOFF_AGE_MS: 60_000,
}));

const dispatchImageMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/background/imageTranslateDispatch', () => ({
  dispatchImageTranslate: (...a: unknown[]) => dispatchImageMock(...a),
}));

vi.mock('@/background/contextMenu', () => ({
  SITE_TOGGLE_ID: 'ega-toggle-site',
  computeSiteMenuTitle: vi.fn((disabled: boolean) =>
    disabled ? 'Enable Ega on this site' : 'Disable Ega on this site',
  ),
  handleSiteToggleClick: vi.fn().mockResolvedValue(undefined),
  refreshSiteToggleLabel: vi.fn().mockResolvedValue(undefined),
  installContextMenus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/background/router', () => ({
  createRouter: vi.fn(() => ({
    translate: vi.fn(),
    cancel: vi.fn(),
    clearProbes: vi.fn(),
  })),
  settingsToConfig: vi.fn(),
}));

vi.mock('@/background/pre-warm', () => ({
  resolvePreWarmProvider: vi.fn().mockReturnValue(null),
}));

vi.mock('@/shared/cli-session/port-manager', () => ({
  getStatus: vi.fn().mockReturnValue('cold'),
  warm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/background/native-test', () => ({
  handleNativeTest: vi.fn(),
}));

vi.mock('@/shared/backends/registry', () => ({
  instantiateAll: vi.fn(() => ({})),
  resolveBackend: vi.fn(),
}));

// Stub getSettings to return a settings shape with DEFAULT_CONTEXT_MENU_ITEMS
const defaultSettingsStub: Partial<Settings> = {
  contextMenuItems: DEFAULT_CONTEXT_MENU_ITEMS,
  defaultTargetLang: 'en' as unknown as Settings['defaultTargetLang'],
  defaultTone: 'neutral' as const,
  defaultTask: 'translate' as const,
};

vi.mock('@/shared/storage', () => ({
  getSettings: vi.fn().mockResolvedValue(defaultSettingsStub),
  getCustomLanguages: vi.fn().mockResolvedValue([]),
  getCustomTasks: vi.fn().mockResolvedValue([]),
  updateSettings: vi.fn().mockResolvedValue(undefined),
  replaceSitePrefs: vi.fn().mockResolvedValue(undefined),
  onSettingsChanged: vi.fn(() => () => {}),
  subscribeSettings: vi.fn(() => () => {}),
}));

vi.mock('@/background/cache', () => ({
  TranslationCache: vi.fn(function () {
    return {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      clearProbes: vi.fn(),
    };
  }),
}));

// Import the module AFTER mocks are set up so the top-level SW code uses the stubs
await import('@/background/index');

const TAB = {
  id: 42,
  url: 'https://example.com',
  index: 0,
  pinned: false,
  highlighted: false,
  windowId: 1,
  active: true,
  incognito: false,
} as chrome.tabs.Tab;

function emitClick(menuItemId: string, extra: Partial<chrome.contextMenus.OnClickData> = {}): void {
  const info: chrome.contextMenus.OnClickData = {
    menuItemId,
    editable: false,
    pageUrl: 'https://example.com',
    ...extra,
  };
  chromeMock.contextMenus.onClicked.emit(info, TAB);
}

beforeEach(() => {
  resetChromeMock();
  writeHandoffMock.mockResolvedValue(undefined);
  dispatchImageMock.mockResolvedValue(undefined);
  defaultSettingsStub.contextMenuItems = DEFAULT_CONTEXT_MENU_ITEMS;
  vi.clearAllMocks();
});

/** Same list with every image item's surface swapped, as the Display-tab global writes it. */
function imageItemsWithSurface(surface: 'tooltip' | 'sidepanel'): ContextMenuItem[] {
  return DEFAULT_CONTEXT_MENU_ITEMS.map((i) =>
    i.kind === 'image-task' ? { ...i, surface } : i,
  ) as ContextMenuItem[];
}

describe('onClicked — tooltip task', () => {
  it('sends ctx:translate-selection with task when id matches a task/tooltip item', async () => {
    emitClick('ega-translate-selection', { selectionText: 'hello world' });
    await flushAsync();

    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      TAB.id,
      expect.objectContaining({
        kind: 'ctx:translate-selection',
        text: 'hello world',
        task: 'translate',
      }),
    );
    expect(chromeMock.sidePanel.open).not.toHaveBeenCalled();
  });

  it('omits targetLang when item has no targetLang override', async () => {
    emitClick('ega-translate-selection', { selectionText: 'test' });
    await flushAsync();

    const call = (chromeMock.tabs.sendMessage as Mock).mock.calls[0];
    const payload = call?.[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('targetLang');
  });

  it('uses empty string for text when selectionText is absent', async () => {
    emitClick('ega-translate-selection');
    await flushAsync();

    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      TAB.id,
      expect.objectContaining({ kind: 'ctx:translate-selection', text: '' }),
    );
  });
});

describe('onClicked — sidepanel task', () => {
  it('calls sidePanel.open and writePendingPopupHandoff', async () => {
    emitClick('ega-sidepanel-selection', { selectionText: 'side text' });
    await flushAsync();

    expect(chromeMock.sidePanel.open).toHaveBeenCalledWith({ tabId: TAB.id });
    expect(writeHandoffMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceText: 'side text',
        task: 'translate',
        // Stamped with the sending window, so only that window's panel drains it.
        windowId: TAB.windowId,
      }),
    );
    // no sendMessage to content-script for sidepanel path
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('opens side panel synchronously, before any await (gesture window)', () => {
    emitClick('ega-sidepanel-selection', { selectionText: 'side text' });

    expect(chromeMock.sidePanel.open).toHaveBeenCalledWith({ tabId: TAB.id });
  });

  it('sidePanel.open fires before writePendingPopupHandoff resolves (gesture-window ordering)', async () => {
    // make the handoff write block indefinitely
    let resolveWrite!: () => void;
    writeHandoffMock.mockReturnValueOnce(
      new Promise<void>((r) => {
        resolveWrite = r;
      }),
    );

    emitClick('ega-sidepanel-selection', { selectionText: 'side text' });

    // One microtask tick — the async IIFE reaches the sidePanel.open call
    await Promise.resolve();
    await Promise.resolve();

    // open() must have fired while the write is still pending
    expect(chromeMock.sidePanel.open).toHaveBeenCalledWith({ tabId: TAB.id });
    expect(writeHandoffMock).toHaveBeenCalledTimes(1);

    resolveWrite();
    await flushAsync();
  });
});

describe('onClicked — image-task', () => {
  it('calls sidePanel.open and dispatchImageTranslate for image items', async () => {
    emitClick('ega-translate-image', { srcUrl: 'https://example.com/img.png' });
    await flushAsync();

    expect(chromeMock.sidePanel.open).toHaveBeenCalledWith({ tabId: TAB.id });
    expect(dispatchImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: TAB.id,
        imageUrl: 'https://example.com/img.png',
        task: 'translate',
      }),
    );
  });

  it('passes task: explain for ega-explain-image', async () => {
    emitClick('ega-explain-image', { srcUrl: 'https://example.com/img.png' });
    await flushAsync();

    expect(dispatchImageMock).toHaveBeenCalledWith(expect.objectContaining({ task: 'explain' }));
  });

  it('threads the item surface into the dispatcher', async () => {
    emitClick('ega-translate-image', { srcUrl: 'https://example.com/img.png' });
    await flushAsync();

    expect(dispatchImageMock).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'sidepanel' }),
    );
  });

  it('threads a tooltip item surface through instead of the global setting', async () => {
    // A stored default id with an edited surface: the menus register the re-minted id.
    const stored = withEncodedMenuIds(imageItemsWithSurface('tooltip'));
    const imgId = stored.find((i) => i.kind === 'image-task')?.id ?? '';
    defaultSettingsStub.contextMenuItems = imageItemsWithSurface('tooltip');

    emitClick(imgId, { srcUrl: 'https://example.com/img.png' });
    await flushAsync();

    expect(dispatchImageMock).toHaveBeenCalledWith(expect.objectContaining({ surface: 'tooltip' }));
    expect(chromeMock.sidePanel.open).not.toHaveBeenCalled();
  });

  it('never opens the side panel for one surface while routing the answer to the other', async () => {
    // The stale id is not registered any more, so the click falls back to the default action.
    defaultSettingsStub.contextMenuItems = imageItemsWithSurface('tooltip');

    emitClick('ega-translate-image', { srcUrl: 'https://example.com/img.png' });
    await flushAsync();

    expect(chromeMock.sidePanel.open).toHaveBeenCalledWith({ tabId: TAB.id });
    expect(dispatchImageMock).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'sidepanel' }),
    );
  });

  it('a surface-edited image item does NOT open the side panel — the id is the only sync channel', () => {
    // The editor keeps the shipped id; the worker registers an id that encodes the surface.
    const stored = imageItemsWithSurface('tooltip');
    const imgId = withEncodedMenuIds(stored).find((i) => i.kind === 'image-task')?.id ?? '';
    defaultSettingsStub.contextMenuItems = stored;

    emitClick(imgId, { srcUrl: 'https://example.com/img.png' });

    expect(chromeMock.sidePanel.open).not.toHaveBeenCalled();
  });

  it('the async path still resolves the stored tooltip item', async () => {
    // The editor keeps the shipped id; the worker registers an id that encodes the surface.
    const stored = imageItemsWithSurface('tooltip');
    const imgId = withEncodedMenuIds(stored).find((i) => i.kind === 'image-task')?.id ?? '';
    defaultSettingsStub.contextMenuItems = stored;

    emitClick(imgId, { srcUrl: 'https://example.com/img.png' });
    await flushAsync();

    expect(dispatchImageMock).toHaveBeenCalledWith(expect.objectContaining({ surface: 'tooltip' }));
  });

  it('still opens the side panel for a sidepanel-surface image item', () => {
    emitClick('ega-explain-image', { srcUrl: 'https://example.com/img.png' });

    expect(chromeMock.sidePanel.open).toHaveBeenCalledWith({ tabId: TAB.id });
  });

  it('opens side panel synchronously, before any await (gesture window)', () => {
    // No flushAsync: open() must run inside the gesture turn, before any await, or Chrome rejects it.
    emitClick('ega-translate-image', { srcUrl: 'https://example.com/img.png' });

    expect(chromeMock.sidePanel.open).toHaveBeenCalledWith({ tabId: TAB.id });
  });

  it('opens side panel synchronously for explain image too', () => {
    emitClick('ega-explain-image', { srcUrl: 'https://example.com/img.png' });

    expect(chromeMock.sidePanel.open).toHaveBeenCalledWith({ tabId: TAB.id });
  });

  it('does nothing when srcUrl is absent', async () => {
    emitClick('ega-translate-image');
    await flushAsync();

    expect(chromeMock.sidePanel.open).not.toHaveBeenCalled();
    expect(dispatchImageMock).not.toHaveBeenCalled();
  });
});

describe('onClicked — page singletons', () => {
  it('page-translate → sendMessage page:translateAll', async () => {
    emitClick('ega-translate-page');
    await flushAsync();

    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      TAB.id,
      expect.objectContaining({ kind: 'page:translateAll' }),
    );
  });

  it('pick-element → sendMessage picker:enter', async () => {
    emitClick('ega-pick-element');
    await flushAsync();

    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      TAB.id,
      expect.objectContaining({ kind: 'picker:enter' }),
    );
  });

  it('site-toggle → handleSiteToggleClick', async () => {
    const { handleSiteToggleClick } = await import('@/background/contextMenu');
    emitClick('ega-toggle-site');
    await flushAsync();

    expect(handleSiteToggleClick).toHaveBeenCalled();
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
  });
});

describe('onClicked — unknown id', () => {
  it('is a no-op (resolveMenuAction returns null → early return)', async () => {
    emitClick('ega-unknown-item-xyz', { selectionText: 'text' });
    await flushAsync();

    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
    expect(chromeMock.sidePanel.open).not.toHaveBeenCalled();
    expect(writeHandoffMock).not.toHaveBeenCalled();
  });
});

describe('onClicked — cold SW decides from the encoded id, not the defaults cache', () => {
  const customSidepanelTask: ContextMenuItem = {
    id: 'ega-custom-txt-sp-7',
    kind: 'task',
    enabled: true,
    order: 7,
    label: 'Custom send to panel',
    task: 'translate',
    surface: 'sidepanel',
  };

  it('opens the side panel synchronously for a custom sidepanel item absent from the defaults cache', () => {
    defaultSettingsStub.contextMenuItems = [...DEFAULT_CONTEXT_MENU_ITEMS, customSidepanelTask];

    emitClick('ega-custom-txt-sp-7', { selectionText: 'hi' });

    expect(chromeMock.sidePanel.open).toHaveBeenCalledWith({ tabId: TAB.id });
  });

  it('still writes the handoff for the custom sidepanel item once settings resolve', async () => {
    defaultSettingsStub.contextMenuItems = [...DEFAULT_CONTEXT_MENU_ITEMS, customSidepanelTask];

    emitClick('ega-custom-txt-sp-7', { selectionText: 'hi' });
    await flushAsync();

    expect(writeHandoffMock).toHaveBeenCalledWith(expect.objectContaining({ sourceText: 'hi' }));
  });

  it('does NOT open the panel for a custom tooltip-surface item', () => {
    emitClick('ega-custom-txt-tt-3', { selectionText: 'hi' });

    expect(chromeMock.sidePanel.open).not.toHaveBeenCalled();
  });

  it('a surface-edited image item (re-idded to tooltip) no longer opens the panel', () => {
    // Defaults say image items open the panel; the re-idded id encodes tooltip and wins.
    emitClick('ega-custom-img-tt-4', { srcUrl: 'https://example.com/img.png' });

    expect(chromeMock.sidePanel.open).not.toHaveBeenCalled();
  });

  it('opens the panel for an encoded sidepanel image item only when srcUrl is present', () => {
    emitClick('ega-custom-img-sp-5', { srcUrl: 'https://example.com/img.png' });
    expect(chromeMock.sidePanel.open).toHaveBeenCalledWith({ tabId: TAB.id });

    (chromeMock.sidePanel.open as Mock).mockClear();
    emitClick('ega-custom-img-sp-5');
    expect(chromeMock.sidePanel.open).not.toHaveBeenCalled();
  });
});

describe('onClicked — handoff write failure', () => {
  it('pushes an error audit entry so the opened panel shows a toast instead of staying empty', async () => {
    writeHandoffMock.mockRejectedValueOnce(new Error('quota'));

    emitClick('ega-sidepanel-selection', { selectionText: 'hi' });
    await flushAsync();
    await flushAsync();

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'audit:append' }),
    );
  });
});

describe('onClicked — a pre-v5 custom id', () => {
  /** Ids minted before the convention encode nothing, so the sync half could not see the surface. */
  const legacy: ContextMenuItem[] = [
    ...DEFAULT_CONTEXT_MENU_ITEMS,
    {
      id: 'ega-custom-3',
      kind: 'task',
      enabled: true,
      order: 7,
      label: 'Send to side panel',
      task: 'translate',
      surface: 'sidepanel',
    },
  ];

  it('opens the side panel for a re-minted sidepanel item and writes the handoff', async () => {
    defaultSettingsStub.contextMenuItems = legacy;
    const id = withEncodedMenuIds(legacy).find((i) => i.label === 'Send to side panel')?.id ?? '';

    emitClick(id, { selectionText: 'legacy' });
    await flushAsync();

    expect(chromeMock.sidePanel.open).toHaveBeenCalledWith({ tabId: TAB.id });
    expect(writeHandoffMock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceText: 'legacy' }),
    );
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
  });
});

describe('onClicked — a custom task item', () => {
  it.each([
    ['tooltip', 'ega-custom-txt-tt-7'],
    ['sidepanel', 'ega-custom-txt-sp-7'],
  ] as const)('%s surface carries the custom id', async (surface, id) => {
    defaultSettingsStub.contextMenuItems = [
      ...DEFAULT_CONTEXT_MENU_ITEMS,
      { id, kind: 'task', enabled: true, order: 9, label: 'Tweet it', task: 'c-tweet', surface },
    ] as ContextMenuItem[];
    emitClick(id, { selectionText: 'a long thread' });
    await flushAsync();
    if (surface === 'tooltip') {
      expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
        TAB.id,
        expect.objectContaining({ kind: 'ctx:translate-selection', task: 'c-tweet' }),
      );
    } else {
      expect(writeHandoffMock).toHaveBeenCalledWith(expect.objectContaining({ task: 'c-tweet' }));
    }
  });
});
