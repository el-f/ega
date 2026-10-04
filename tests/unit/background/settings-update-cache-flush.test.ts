import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

const backendIds = [...DEFAULT_SETTINGS.backendOrder];

// `@/shared/storage` is deliberately NOT mocked — a stubbed updateSettings never writes, so the flush policy would never run.

vi.mock('@/background/contextMenu', () => ({
  SITE_TOGGLE_ID: 'ega-toggle-site',
  computeSiteMenuTitle: vi.fn(() => 'Disable Ega on this site'),
  handleSiteToggleClick: vi.fn().mockResolvedValue(undefined),
  refreshSiteToggleLabel: vi.fn().mockResolvedValue(undefined),
  installContextMenus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/shared/pending-popup-handoff', () => ({
  writePendingPopupHandoff: vi.fn().mockResolvedValue(undefined),
  drainPendingPopupHandoff: vi.fn().mockResolvedValue([]),
  PENDING_POPUP_HANDOFF_KEY: 'ega.pendingPopupHandoff',
  MAX_HANDOFF_AGE_MS: 60_000,
}));
vi.mock('@/background/imageTranslateDispatch', () => ({
  dispatchImageTranslate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/background/router', () => ({
  createRouter: vi.fn(() => ({
    handleTranslate: vi.fn(),
    cancel: vi.fn(),
    cancelAll: vi.fn(() => 0),
    clearProbes: vi.fn(),
  })),
  settingsToConfig: vi.fn(),
}));
vi.mock('@/background/pre-warm', () => ({ resolvePreWarmProvider: vi.fn().mockReturnValue(null) }));
vi.mock('@/shared/cli-session/port-manager', () => ({
  getStatus: vi.fn().mockReturnValue('cold'),
  warm: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/background/native-test', () => ({ handleNativeTest: vi.fn() }));
vi.mock('@/shared/backends/registry', () => ({
  instantiateAll: vi.fn(() => ({})),
  resolveBackend: vi.fn(),
  getRegisteredBackendIds: vi.fn(() => backendIds),
}));

const cacheClearMock = vi.fn();
vi.mock('@/background/cache', () => ({
  TranslationCache: vi.fn(function () {
    return {
      get: vi.fn(),
      set: vi.fn(),
      clear: cacheClearMock,
      clearProbes: vi.fn(),
    };
  }),
}));

await import('@/background/index');

function patch(p: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve) => {
    chromeMock.runtime.onMessage.emit(
      { kind: 'settings:update', patch: p },
      { id: chromeMock.runtime.id },
      resolve,
    );
  });
}

beforeEach(async () => {
  resetChromeMock();
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  // One empty patch first: the stored defaults still lack the task maps, so the first write of any kind differs on them.
  await patch({});
  cacheClearMock.mockClear();
});

describe('settings:update honors CACHE_SAFE_SETTINGS_KEYS', () => {
  it('does not flush the cache for a per-site toggle', async () => {
    const ack = (await patch({ sitePrefs: { 'https://a.com': { disabled: true } } })) as {
      ok: boolean;
    };
    expect(ack.ok).toBe(true);

    expect(cacheClearMock).not.toHaveBeenCalled();
  });

  it('does not flush the cache for the popup theme toggle', async () => {
    expect(await patch({ theme: 'dark' })).toEqual(expect.objectContaining({ ok: true }));

    expect(cacheClearMock).not.toHaveBeenCalled();
  });

  it('flushes for a prompt-shaping field', async () => {
    expect(await patch({ defaultTone: 'formal' })).toEqual(expect.objectContaining({ ok: true }));

    expect(cacheClearMock).toHaveBeenCalled();
  });
});

describe('content scripts hear mirrored-key changes from the worker, not from storage', () => {
  const told = (): unknown[] =>
    (chromeMock.tabs.sendMessage.mock.calls as unknown[][])
      .map((c) => c[1])
      .filter((m) => (m as { kind?: string }).kind === 'content:storage-changed');

  it('tells every tab which mirrored key changed, with no values', async () => {
    await new Promise((r) => setTimeout(r, 0));
    chromeMock.tabs.sendMessage.mockClear();
    chromeMock.tabs.query.mockResolvedValue([{ id: 4 }, { id: 9 }]);
    await chromeMock.storage.local.set({ [STORAGE_KEYS.customLanguages]: [] });
    await new Promise((r) => setTimeout(r, 0));

    expect(told()).toEqual([
      { kind: 'content:storage-changed', keys: [STORAGE_KEYS.customLanguages] },
      { kind: 'content:storage-changed', keys: [STORAGE_KEYS.customLanguages] },
    ]);
  });

  it('says nothing for a side-panel thread save', async () => {
    await new Promise((r) => setTimeout(r, 0));
    chromeMock.tabs.sendMessage.mockClear();
    chromeMock.tabs.query.mockResolvedValue([{ id: 4 }]);
    await chromeMock.storage.local.set({ 'ega:conv:t:https://a.test': { turns: [] } });
    await new Promise((r) => setTimeout(r, 0));

    expect(told()).toEqual([]);
  });
});
