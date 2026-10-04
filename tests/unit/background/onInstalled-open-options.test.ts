import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '@tests/mocks/chrome';
import type { Settings } from '@/shared/types';

// Mock the heavy service-worker deps before importing the module under test.

vi.mock('@/shared/pending-popup-handoff', () => ({
  writePendingPopupHandoff: vi.fn().mockResolvedValue(undefined),
  drainPendingPopupHandoff: vi.fn().mockResolvedValue([]),
  PENDING_POPUP_HANDOFF_KEY: 'ega.pendingPopupHandoff',
  MAX_HANDOFF_AGE_MS: 60_000,
}));

vi.mock('@/background/imageTranslateDispatch', () => ({
  dispatchImageTranslate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/background/contextMenu', () => ({
  SITE_TOGGLE_ID: 'ega-toggle-site',
  computeSiteMenuTitle: vi.fn(() => 'Disable Ega on this site'),
  handleSiteToggleClick: vi.fn().mockResolvedValue(undefined),
  refreshSiteToggleLabel: vi.fn().mockResolvedValue(undefined),
  installContextMenus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/background/router', () => ({
  createRouter: vi.fn(() => ({ translate: vi.fn(), cancel: vi.fn(), clearProbes: vi.fn() })),
  settingsToConfig: vi.fn(),
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

const settingsStub: Partial<Settings> = { contextMenuItems: [], contextMenuLayout: 'nested' };

vi.mock('@/shared/storage', () => ({
  getSettings: vi.fn().mockResolvedValue(settingsStub),
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

await import('@/background/index');

beforeEach(() => {
  resetChromeMock();
  vi.clearAllMocks();
});

describe('onInstalled — first run', () => {
  it('opens the options page on a fresh install', () => {
    chromeMock.runtime.onInstalled.emit({ reason: 'install' } as chrome.runtime.InstalledDetails);
    expect(chromeMock.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it('leaves the options page alone on an update', () => {
    chromeMock.runtime.onInstalled.emit({
      reason: 'update',
      previousVersion: '0.28.0',
    } as chrome.runtime.InstalledDetails);
    expect(chromeMock.runtime.openOptionsPage).not.toHaveBeenCalled();
  });
});
