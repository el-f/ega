import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '@tests/mocks/chrome';
import type { Settings } from '@/shared/types';

const pushAuditEntry = vi.fn().mockResolvedValue(undefined);
const clearAuditLog = vi.fn().mockResolvedValue(undefined);

vi.mock('@/shared/audit-log', () => ({ pushAuditEntry, clearAuditLog }));

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

const handleTranslate = vi.fn().mockResolvedValue(undefined);
vi.mock('@/background/router', () => ({
  createRouter: vi.fn(() => ({
    handleTranslate,
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
vi.mock('@/background/describe-change', () => ({ describeChange: vi.fn() }));
vi.mock('@/background/native-test', () => ({ handleNativeTest: vi.fn() }));
vi.mock('@/shared/backends/registry', () => ({
  instantiateAll: vi.fn(() => ({})),
  resolveBackend: vi.fn(),
}));

const settingsStub: Partial<Settings> = { contextMenuItems: [], contextMenuLayout: 'nested' };
vi.mock('@/shared/storage', () => ({
  getSettings: vi.fn().mockResolvedValue(settingsStub),
  getCustomLanguages: vi.fn().mockResolvedValue([]),
  updateSettings: vi.fn().mockResolvedValue(undefined),
  replaceSitePrefs: vi.fn().mockResolvedValue(undefined),
  onSettingsChanged: vi.fn(() => () => {}),
}));

vi.mock('@/background/cache', () => ({
  TranslationCache: vi.fn(function () {
    return { get: vi.fn(), set: vi.fn(), clear: vi.fn() };
  }),
}));

await import('@/background/index');

function send(msg: unknown, sender: chrome.runtime.MessageSender): void {
  chromeMock.runtime.onMessage.emit(msg, sender, () => {});
}

const entry = {
  task: 'backend-test' as const,
  sourceLang: 'arabizi',
  targetLang: 'en',
  backend: 'unknown' as const,
  model: 'm',
  systemPrompt: 's',
  userPrompt: 'u',
  response: '',
  latencyMs: 1,
  cacheHit: false,
};

describe('audit:push — the SW is the only audit-log writer', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.clearAllMocks();
  });

  it('writes an entry sent from the options page and tags it options', () => {
    send(
      { kind: 'audit:push', entry },
      { id: 'ega-test', url: 'chrome-extension://ega-test/src/options/index.html' },
    );
    expect(pushAuditEntry).toHaveBeenCalledWith({ ...entry, surface: 'options' });
  });

  it('tags a side-panel sender sidepanel', () => {
    send(
      { kind: 'audit:push', entry },
      { id: 'ega-test', url: 'chrome-extension://ega-test/src/sidepanel/index.html' },
    );
    expect(pushAuditEntry).toHaveBeenCalledWith({ ...entry, surface: 'sidepanel' });
  });

  it('ignores a message from another extension', () => {
    send({ kind: 'audit:push', entry }, { id: 'attacker', url: 'chrome-extension://x/y.html' });
    expect(pushAuditEntry).not.toHaveBeenCalled();
  });

  it('tags a translate started from a tab as content', async () => {
    send(
      {
        kind: 'translate:start',
        requestId: 'r1',
        text: 'hi',
        sourceLang: 'auto',
        targetLang: 'en',
        options: {},
      },
      { id: 'ega-test', tab: { id: 7 } as chrome.tabs.Tab },
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(handleTranslate).toHaveBeenCalledWith(expect.anything(), expect.any(Function), {
      surface: 'content',
    });
  });

  it('clears through the SW, so the clear shares the push lock', async () => {
    send(
      { kind: 'audit:clear' },
      { id: 'ega-test', url: 'chrome-extension://ega-test/src/options/index.html' },
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(clearAuditLog).toHaveBeenCalledTimes(1);
  });

  it('ignores a clear from another extension', async () => {
    send({ kind: 'audit:clear' }, { id: 'attacker', url: 'chrome-extension://x/y.html' });
    await new Promise((r) => setTimeout(r, 0));
    expect(clearAuditLog).not.toHaveBeenCalled();
  });
});
