import { it, expect, vi } from 'vitest';
import { chromeMock } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { flushAsync } from '@tests/_helpers/async';

// `@/shared/storage` is real here: the memo must be cleared by the write a settings:update makes, not by a hand-fired event.

const backendIds = [...DEFAULT_SETTINGS.backendOrder];
const handleTranslateMock = vi.hoisted(() => vi.fn());

vi.mock('@/background/contextMenu', () => ({
  SITE_TOGGLE_ID: 'ega-toggle-site',
  computeSiteMenuTitle: vi.fn(() => 'Disable Ega on this site'),
  handleSiteToggleClick: vi.fn().mockResolvedValue(undefined),
  refreshSiteToggleLabel: vi.fn().mockResolvedValue(undefined),
  installContextMenus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/background/router', () => ({
  createRouter: vi.fn(() => ({
    handleTranslate: handleTranslateMock,
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

await chromeMock.storage.local.set({
  [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, defaultTargetLang: 'en' },
});
await import('@/background/index');

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

function patch(p: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve) => {
    chromeMock.runtime.onMessage.emit(
      { kind: 'settings:update', patch: p },
      { id: chromeMock.runtime.id },
      resolve,
    );
  });
}

function targetLangOf(call: number): string {
  const req = handleTranslateMock.mock.calls[call]?.[0] as { targetLang?: string } | undefined;
  return String(req?.targetLang);
}

it('a settings:update write clears the memo before its ack, so the next request reads the new value', async () => {
  await startTranslate('before');
  expect(targetLangOf(0)).toBe('en');

  const ack = (await patch({ defaultTargetLang: 'fr' })) as { ok?: boolean };
  expect(ack.ok).toBe(true);
  await startTranslate('after');

  expect(targetLangOf(1)).toBe('fr');
});

it('answers a content script read with the settings and no API keys', async () => {
  await chromeMock.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, anthropicApiKey: 'sk-ant', shortcut: 'Alt+Q' },
  });
  let answer: Record<string, unknown> | undefined;
  chromeMock.runtime.onMessage.emit(
    { kind: 'content:read-settings' },
    { id: chromeMock.runtime.id, tab: { id: 1 } } as unknown as chrome.runtime.MessageSender,
    (r: unknown) => (answer = r as Record<string, unknown>),
  );
  await vi.waitFor(() => expect(answer).toBeDefined());
  expect(answer?.['shortcut']).toBe('Alt+Q');
  expect(answer).not.toHaveProperty('anthropicApiKey');
});
