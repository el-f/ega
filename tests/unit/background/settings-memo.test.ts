import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '@tests/mocks/chrome';
import { DEFAULT_CONTEXT_MENU_ITEMS } from '@/shared/context-menu';
import type { Settings } from '@/shared/types';
import { STORAGE_KEYS } from '@/shared/constants';
import { flushAsync } from '@tests/_helpers/async';

vi.mock('@/background/contextMenu', () => ({
  computeSiteMenuTitle: vi.fn(),
  handleSiteToggleClick: vi.fn().mockResolvedValue(undefined),
  refreshSiteToggleLabel: vi.fn().mockResolvedValue(undefined),
  installContextMenus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/shared/pending-popup-handoff', () => ({
  writePendingPopupHandoff: vi.fn().mockResolvedValue(undefined),
  drainPendingPopupHandoff: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/background/imageTranslateDispatch', () => ({
  dispatchImageTranslate: vi.fn().mockResolvedValue(undefined),
}));
const handleTranslateMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/background/router', () => ({
  createRouter: vi.fn(() => ({
    handleTranslate: (...a: unknown[]) => handleTranslateMock(...a),
    cancel: vi.fn(),
    cancelAll: vi.fn().mockReturnValue(0),
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
  contextMenuItems: DEFAULT_CONTEXT_MENU_ITEMS,
  contextMenuLayout: 'nested' as const,
  defaultTargetLang: 'en' as unknown as Settings['defaultTargetLang'],
};
/** A later write, so a test can tell the memoized object from a fresh read by its value. */
const rewrittenStub: Partial<Settings> = {
  ...settingsStub,
  defaultTargetLang: 'fr' as unknown as Settings['defaultTargetLang'],
};
const getSettingsMock = vi.fn().mockResolvedValue(settingsStub);
vi.mock('@/shared/storage', () => ({
  getSettings: (...a: unknown[]) => getSettingsMock(...a),
  getCustomLanguages: vi.fn().mockResolvedValue([]),
  getCustomTasks: vi.fn().mockResolvedValue([]),
  updateSettings: vi.fn().mockResolvedValue(undefined),
  replaceSitePrefs: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/background/cache', () => ({
  TranslationCache: vi.fn(function () {
    return { get: vi.fn(), set: vi.fn(), clear: vi.fn() };
  }),
}));

await import('@/background/index');

/** A `translate:start` with no targetLang reads settings for the default. */
async function startTranslate(requestId: string): Promise<void> {
  chromeMock.runtime.onMessage.emit(
    {
      kind: 'translate:start',
      requestId,
      text: 'hola',
      sourceLang: 'auto',
      options: { stream: false, explain: false },
    },
    { id: chromeMock.runtime.id, tab: { id: 1 } } as unknown as chrome.runtime.MessageSender,
    () => {},
  );
  await flushAsync();
}

/** The language the router was actually handed — the memo's value, not its call count. */
function targetLangOf(call: number): string {
  const req = handleTranslateMock.mock.calls[call]?.[0] as { targetLang?: string } | undefined;
  return String(req?.targetLang);
}

function settingsChanged(key: string): void {
  chromeMock.storage.local._fire({ [key]: { oldValue: {}, newValue: {} } });
}

beforeEach(() => {
  resetChromeMock();
  // The boot-time pre-warm read is memoized; start each test from a cold memo.
  settingsChanged(STORAGE_KEYS.settings);
  vi.clearAllMocks();
  getSettingsMock.mockResolvedValue(settingsStub);
});

describe('service-worker settings memo', () => {
  it('serves every consumer from one storage read until a settings write lands', async () => {
    await startTranslate('m1');
    // Storage moves on with no change event: a consumer that re-read would see 'fr'.
    getSettingsMock.mockResolvedValue(rewrittenStub);
    await startTranslate('m2');

    expect(getSettingsMock).toHaveBeenCalledTimes(1);
    expect(handleTranslateMock).toHaveBeenCalledTimes(2);
    expect(targetLangOf(0)).toBe('en');
    expect(targetLangOf(1)).toBe('en');
  });

  it('a settings write invalidates the memo, so the next read is fresh', async () => {
    await startTranslate('m1');
    getSettingsMock.mockResolvedValue(rewrittenStub);
    settingsChanged(STORAGE_KEYS.settings);
    await startTranslate('m2');

    expect(getSettingsMock).toHaveBeenCalledTimes(2);
    expect(targetLangOf(0)).toBe('en');
    expect(targetLangOf(1)).toBe('fr');
  });

  it('a custom-language write invalidates too — the sanitized settings depend on them', async () => {
    await startTranslate('m1');
    getSettingsMock.mockResolvedValue(rewrittenStub);
    settingsChanged(STORAGE_KEYS.customLanguages);
    await startTranslate('m2');

    expect(getSettingsMock).toHaveBeenCalledTimes(2);
    expect(targetLangOf(1)).toBe('fr');
  });

  it('a custom-task write invalidates too', async () => {
    await startTranslate('m1');
    getSettingsMock.mockResolvedValue(rewrittenStub);
    settingsChanged(STORAGE_KEYS.customTasks);
    await startTranslate('m2');
    expect(getSettingsMock).toHaveBeenCalledTimes(2);
    expect(targetLangOf(1)).toBe('fr');
  });

  it('a write in another storage area leaves the memo alone', async () => {
    await startTranslate('m1');
    chromeMock.storage.sync._fire({ [STORAGE_KEYS.settings]: { oldValue: {}, newValue: {} } });
    getSettingsMock.mockResolvedValue(rewrittenStub);
    await startTranslate('m2');

    expect(getSettingsMock).toHaveBeenCalledTimes(1);
    expect(targetLangOf(1)).toBe('en');
  });

  it('a failed read is not kept', async () => {
    getSettingsMock.mockRejectedValueOnce(new Error('storage unavailable'));
    getSettingsMock.mockResolvedValue(rewrittenStub);
    await startTranslate('m1');
    await startTranslate('m2');

    expect(getSettingsMock).toHaveBeenCalledTimes(2);
    expect(handleTranslateMock).toHaveBeenCalledTimes(2);
    // The rejected read falls back to 'en'; the retry reads storage again and gets 'fr'.
    expect(targetLangOf(0)).toBe('en');
    expect(targetLangOf(1)).toBe('fr');
  });
});
