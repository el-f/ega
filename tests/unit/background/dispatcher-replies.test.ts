import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { HISTORY_CUT_MARKER, MAX_HISTORY_TURN_CHARS } from '@/shared/chat-history';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Msg, MsgReply } from '@/shared/messages';
import type { TranslationRequest } from '@/shared/types';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import { isWellFormed } from '@tests/_helpers/well-formed';

const backendIds = [...DEFAULT_SETTINGS.backendOrder];

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
const routerMock = {
  handleTranslate: vi.fn().mockResolvedValue(undefined),
  cancel: vi.fn(),
  cancelAll: vi.fn(() => 2),
  clearProbes: vi.fn(),
};
vi.mock('@/background/router', () => ({
  createRouter: vi.fn(() => routerMock),
  settingsToConfig: vi.fn(),
}));
vi.mock('@/background/pre-warm', () => ({ resolvePreWarmProvider: vi.fn().mockReturnValue(null) }));
vi.mock('@/shared/cli-session/port-manager', () => ({
  getStatus: vi.fn().mockReturnValue('warm'),
  warm: vi.fn().mockResolvedValue(undefined),
}));
const { probeAllMock } = vi.hoisted(() => ({ probeAllMock: vi.fn() }));
vi.mock('@/shared/translate-ui', () => ({ defaultProbe: probeAllMock }));
vi.mock('@/background/native-test', () => ({ handleNativeTest: vi.fn() }));
vi.mock('@/shared/backends/registry', () => ({
  BACKEND_API_KEY_FIELDS: ['anthropicApiKey', 'openaiApiKey'],
  instantiateAll: vi.fn(() => ({})),
  resolveBackend: vi.fn(),
  getRegisteredBackendIds: vi.fn(() => backendIds),
}));
const openOptionsTab = vi.fn();
vi.mock('@/shared/open-options-tab', () => ({
  openOptionsTab: (...a: unknown[]) => openOptionsTab(...a),
}));
const cacheClearMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/background/cache', () => ({
  TranslationCache: vi.fn(function () {
    return { get: vi.fn(), set: vi.fn(), clear: cacheClearMock };
  }),
}));

await import('@/background/index');

const PAGE_SENDER = {
  id: chromeMock.runtime.id,
  url: 'chrome-extension://ega-test/src/options/index.html',
};
const TAB_SENDER = { id: chromeMock.runtime.id, tab: { id: 7, windowId: 1 } };

function ask<K extends Msg['kind']>(
  msg: Extract<Msg, { kind: K }>,
  sender: object = PAGE_SENDER,
): Promise<MsgReply[K] | 'no-reply'> {
  return new Promise((resolve) => {
    chromeMock.runtime.onMessage.emit(msg, sender, resolve as (r: unknown) => void);
    // A kind the worker does not own never calls sendResponse; every owned kind answers well inside this.
    setTimeout(() => resolve('no-reply'), 50);
  });
}

beforeEach(async () => {
  resetChromeMock();
  routerMock.handleTranslate.mockClear();
  routerMock.cancel.mockClear();
  routerMock.cancelAll.mockClear();
  cacheClearMock.mockClear();
  openOptionsTab.mockClear();
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
});

// Every reply below is typed against MsgReply, so a drifted shape fails here before any consumer casts it.
describe('background dispatcher replies', () => {
  it('rejects a sender from another extension before looking at the kind', async () => {
    const reply = await ask({ kind: 'backend:probe' }, { id: 'someone-else' });
    expect(reply).toEqual({ ok: false, error: 'forbidden' });
  });

  it('answers nothing for a kind it does not own', async () => {
    expect(await ask({ kind: 'hotkey:translate' })).toBe('no-reply');
  });

  it('settings:update returns the merged settings, and strips API keys for a content script', async () => {
    const fromPage = await ask({ kind: 'settings:update', patch: { anthropicApiKey: 'sk-ant-x' } });
    expect(fromPage).toMatchObject({ ok: true, settings: { anthropicApiKey: 'sk-ant-x' } });

    const fromTab = await ask(
      { kind: 'settings:update', patch: { bubbleFirstRunSeen: true } },
      TAB_SENDER,
    );
    expect(fromTab).toMatchObject({ ok: true, settings: { bubbleFirstRunSeen: true } });
    expect((fromTab as { settings?: Record<string, unknown> }).settings).not.toHaveProperty(
      'anthropicApiKey',
    );
  });

  it('settings:update refuses a patch the schema rejects', async () => {
    const reply = await ask({ kind: 'settings:update', patch: { theme: 'neon' } });
    expect(reply).toEqual({ ok: false, reason: 'schema' });
  });

  it.each([
    ['QUOTA_BYTES quota exceeded', 'quota'],
    ['disk full', 'unknown'],
  ])('settings:update reports a failed write (%s) as %s', async (error, reason) => {
    const set = vi.spyOn(chromeMock.storage.local, 'set').mockRejectedValueOnce(new Error(error));
    try {
      const reply = await ask({ kind: 'settings:update', patch: { theme: 'dark' } });
      expect(reply).toEqual({ ok: false, reason });
      expect(set).toHaveBeenCalledTimes(1);
    } finally {
      set.mockRestore();
    }
  });

  it('translate:start fills the default target language and hands the batch flag through', async () => {
    const reply = await ask(
      {
        kind: 'translate:start',
        requestId: 'r1',
        text: 'salam',
        sourceLang: 'auto',
        options: { stream: true, explain: false, batch: true },
      },
      TAB_SENDER,
    );
    expect(reply).toEqual({ ok: true });
    await vi.waitFor(() => expect(routerMock.handleTranslate).toHaveBeenCalledTimes(1));
    const [req, , meta] = routerMock.handleTranslate.mock.calls[0] as [
      { targetLang: string; options: { batch?: boolean } },
      unknown,
      { surface: string },
    ];
    expect(req.targetLang).toBe(DEFAULT_SETTINGS.defaultTargetLang);
    expect(req.options.batch).toBe(true);
    expect(meta.surface).toBe('content');
  });

  it('translate:cancel and cancel-all reach the router', async () => {
    expect(await ask({ kind: 'translate:cancel', requestId: 'r9' })).toEqual({ ok: true });
    expect(routerMock.cancel).toHaveBeenCalledWith('r9');
    expect(await ask({ kind: 'translate:cancel-all' })).toEqual({ ok: true });
    expect(routerMock.cancelAll).toHaveBeenCalledTimes(1);
    // A content script may not stop every surface's requests.
    expect(await ask({ kind: 'translate:cancel-all' }, TAB_SENDER)).toEqual({ ok: true });
    expect(routerMock.cancelAll).toHaveBeenCalledTimes(1);
  });

  it('the small synchronous kinds answer their documented shapes', async () => {
    expect(await ask({ kind: 'backend:probe' })).toEqual({ ok: true });
    expect(await ask({ kind: 'ui:open-options', tab: 'backends' })).toEqual({ ok: true });
    expect(openOptionsTab).toHaveBeenCalledWith('backends');
    expect(await ask({ kind: 'native:get-port-status' })).toEqual({ ok: true, status: 'warm' });
    // The beforeEach settings write already flushed once through storage.onChanged.
    cacheClearMock.mockClear();
    expect(await ask({ kind: 'cache:clear' })).toEqual({ ok: true });
    expect(cacheClearMock).toHaveBeenCalledTimes(1);
    expect(await ask({ kind: 'perf:entries' })).toEqual({ entries: [] });
  });

  it('audit:push and audit:clear round-trip through the worker-owned log', async () => {
    const entry = {
      task: 'translate' as const,
      sourceLang: 'auto',
      targetLang: 'en',
      backend: 'unknown' as const,
      model: '',
      systemPrompt: '',
      userPrompt: 'hi',
      response: '',
      latencyMs: 1,
      cacheHit: false,
    };
    expect(await ask({ kind: 'audit:push', entry }, TAB_SENDER)).toEqual({ ok: true });
    await vi.waitFor(async () => {
      const stored = (await chromeMock.storage.local.get('egaAuditLog')) as {
        egaAuditLog?: { entries: { surface?: string }[] };
      };
      expect(stored.egaAuditLog?.entries[0]?.surface).toBe('content');
    });
    expect(await ask({ kind: 'audit:clear' })).toEqual({ ok: true });
    const after = (await chromeMock.storage.local.get('egaAuditLog')) as Record<string, unknown>;
    expect(after['egaAuditLog']).toBeUndefined();
  });
});

// A content script can be steered by its page, so it may write only the flags content code writes.
describe('a content script cannot write the settings an extension page owns', () => {
  const PAGE_TAB = {
    id: chromeMock.runtime.id,
    tab: { id: 7, windowId: 1 },
    url: 'https://evil.example/path',
  };
  const ownOrigin = 'https://evil.example';

  async function stored(): Promise<Record<string, unknown>> {
    const r = await chromeMock.storage.local.get(STORAGE_KEYS.settings);
    return r[STORAGE_KEYS.settings] as Record<string, unknown>;
  }

  it.each([
    ['an API key', { openaiApiKey: 'sk-attacker' }],
    ['the theme', { theme: 'dark' }],
    ['another site row', { sitePrefs: { 'https://bank.example': { disabled: false } } }],
    ['two site rows', { sitePrefs: { [ownOrigin]: { disabled: true }, 'https://b.example': { disabled: false } } }],
    ['an allowed flag plus a key', { bubbleFirstRunSeen: true, openaiApiKey: 'sk-x' }],
  ])('refuses %s from a tab, and writes nothing', async (_label, patch) => {
    const before = await stored();
    expect(await ask({ kind: 'settings:update', patch }, PAGE_TAB)).toEqual({
      ok: false,
      reason: 'schema',
    });
    expect(await stored()).toEqual(before);
  });

  it('accepts the content flags and its own site row', async () => {
    const reply = await ask(
      {
        kind: 'settings:update',
        patch: {
          smartBubbleBannerShown: true,
          pageTranslateMode: 'bilingual',
          sitePrefs: { [ownOrigin]: { disabled: true } },
        },
      },
      PAGE_TAB,
    );
    expect(reply).toMatchObject({ ok: true, settings: { pageTranslateMode: 'bilingual' } });
    expect((await stored())['sitePrefs']).toMatchObject({ [ownOrigin]: { disabled: true } });
  });

  it('native:test and audit:clear answer a tab with a refusal', async () => {
    const { handleNativeTest } = await import('@/background/native-test');
    vi.mocked(handleNativeTest).mockClear();
    const reply = await ask(
      {
        kind: 'native:test',
        cfg: { id: 'native' } as never,
        text: 'hi',
        sourceLang: 'auto',
        targetLang: 'en',
      },
      PAGE_TAB,
    );
    expect(reply).toEqual({ ok: false, error: 'forbidden' });
    expect(handleNativeTest).not.toHaveBeenCalled();

    await chromeMock.storage.local.set({ egaAuditLog: { entries: [{ id: 'keep' }] } });
    expect(await ask({ kind: 'audit:clear' }, PAGE_TAB)).toEqual({ ok: false });
    const after = (await chromeMock.storage.local.get('egaAuditLog')) as Record<string, unknown>;
    expect(after['egaAuditLog']).toEqual({ entries: [{ id: 'keep' }] });
  });
});

// The popup and side panel ask the SW for the probe: a probe in the page would open a second native host.
describe('backend:probe-all', () => {
  it('replies with the SW-side probe result', async () => {
    probeAllMock.mockResolvedValue({ available: { gemini: true }, active: 'gemini' });
    await expect(ask({ kind: 'backend:probe-all' })).resolves.toEqual({
      available: { gemini: true },
      active: 'gemini',
    });
  });

  it('replies an empty probe when the probe throws, so the chip settles', async () => {
    probeAllMock.mockRejectedValue(new Error('boom'));
    await expect(ask({ kind: 'backend:probe-all' })).resolves.toEqual({
      available: {},
      active: null,
    });
  });
});

// Site rules match on the tab's host; a popup or side-panel sender is an extension URL and has none.
describe('translate:start pageHost', () => {
  it('comes from the sender tab', async () => {
    routerMock.handleTranslate.mockClear();
    await ask(
      {
        kind: 'translate:start',
        requestId: 'rh1',
        text: 'salam',
        sourceLang: 'auto',
        options: { stream: true, explain: false },
      },
      { id: chromeMock.runtime.id, tab: { id: 7, windowId: 1, url: 'https://www.example.com/a' } },
    );
    await vi.waitFor(() => expect(routerMock.handleTranslate).toHaveBeenCalledTimes(1));
    const [req] = routerMock.handleTranslate.mock.calls[0] as [{ pageHost?: string }];
    expect(req.pageHost).toBe('www.example.com');
  });

  it('is absent for an extension page, so context.pageUrl decides', async () => {
    routerMock.handleTranslate.mockClear();
    await ask(
      {
        kind: 'translate:start',
        requestId: 'rh2',
        text: 'salam',
        sourceLang: 'auto',
        options: { stream: true, explain: false },
      },
      PAGE_SENDER,
    );
    await vi.waitFor(() => expect(routerMock.handleTranslate).toHaveBeenCalledTimes(1));
    const [req] = routerMock.handleTranslate.mock.calls[0] as [{ pageHost?: string }];
    expect(req.pageHost).toBeUndefined();
  });

  // The panel sends no page context when page info is off, and site rules must still apply.
  it.each([
    ['the side panel names its site', PAGE_SENDER, 'https://www.example.com', 'www.example.com'],
    ['the general conversation names none', PAGE_SENDER, 'general', undefined],
    [
      'a content script cannot name another site',
      { id: chromeMock.runtime.id, tab: { id: 7, windowId: 1, url: 'https://own.example/a' } },
      'https://bank.example',
      'own.example',
    ],
    [
      'a content script whose tab url Chrome hides cannot name one either',
      { id: chromeMock.runtime.id, tab: { id: 7, windowId: 1 }, url: 'https://own.example/a' },
      'https://bank.example',
      undefined,
    ],
  ])('%s', async (_label, sender, siteOrigin, host) => {
    routerMock.handleTranslate.mockClear();
    await ask(
      {
        kind: 'translate:start',
        requestId: 'rh3',
        text: 'salam',
        sourceLang: 'auto',
        siteOrigin,
        options: { stream: true, explain: false },
      },
      sender,
    );
    await vi.waitFor(() => expect(routerMock.handleTranslate).toHaveBeenCalledTimes(1));
    const [req] = routerMock.handleTranslate.mock.calls[0] as [{ pageHost?: string }];
    expect(req.pageHost).toBe(host);
  });
});

// A cut at a fixed index can leave half an emoji, which JSON writes as a lone `\ud83d` into the request body.
describe('translate:start caps never cut inside an emoji', () => {
  it('the text, history, refinement and page context stay well formed', async () => {
    routerMock.handleTranslate.mockClear();
    const long = `${'a'.repeat(1999)}😀 and the tail`;
    // History cuts earlier, to leave room for the marker, so its emoji sits on that cut instead.
    const keep = MAX_HISTORY_TURN_CHARS - HISTORY_CUT_MARKER.length - 1;
    const longTurn = `${'a'.repeat(keep)}😀 and the tail`;
    await ask(
      {
        kind: 'translate:start',
        requestId: 'rs1',
        text: long,
        sourceLang: 'auto',
        context: { pageTitle: long, headingTrail: [long] },
        options: {
          stream: true,
          explain: false,
          refinement: long,
          conversationHistory: [
            { role: 'user', content: longTurn },
            { role: 'assistant', content: longTurn },
          ],
        },
      },
      PAGE_SENDER,
    );
    await vi.waitFor(() => expect(routerMock.handleTranslate).toHaveBeenCalledTimes(1));
    const [req] = routerMock.handleTranslate.mock.calls[0] as [TranslationRequest];
    expect(req.text).toBe('a'.repeat(1999));
    // JSON.stringify writes a whole pair as is and only a lone surrogate as an escape.
    expect(JSON.stringify(req)).not.toMatch(/\\ud[89a-f][0-9a-f]{2}/);
    const sentTurn = req.options.conversationHistory?.[1]?.content ?? '';
    expect(sentTurn).toContain(`${'a'.repeat(keep)}${HISTORY_CUT_MARKER}`);
    expect(isWellFormed(sentTurn)).toBe(true);
  });
});

describe('translate:start freshAnswer', () => {
  it('reaches the router, so a Regenerate is not served the cached answer', async () => {
    routerMock.handleTranslate.mockClear();
    await ask(
      {
        kind: 'translate:start',
        requestId: 'rf1',
        text: 'salam',
        sourceLang: 'auto',
        options: { stream: true, explain: false, freshAnswer: true },
      },
      PAGE_SENDER,
    );
    await vi.waitFor(() => expect(routerMock.handleTranslate).toHaveBeenCalledTimes(1));
    const [req] = routerMock.handleTranslate.mock.calls[0] as [TranslationRequest];
    expect(req.options.freshAnswer).toBe(true);
  });
});

// A content script can be steered by its page, so the worker deletes conversations for extension pages only.
describe('conversations:delete trusts extension pages only', () => {
  async function savedTurns(): Promise<number> {
    return (await loadThreadResult('https://a.test')).turns.length;
  }

  beforeEach(async () => {
    await saveThread('https://a.test', [
      { id: 'u1', role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content: 'hola' },
    ]);
  });

  it('a content script is refused, and the conversation stays', async () => {
    expect(
      await ask({ kind: 'conversations:delete', ids: ['https://a.test'] }, TAB_SENDER),
    ).toEqual({ ok: false });
    expect(await ask({ kind: 'conversations:delete', ids: 'all' }, TAB_SENDER)).toEqual({
      ok: false,
    });
    expect(await savedTurns()).toBe(1);
  });

  it('an extension page deletes it', async () => {
    expect(await ask({ kind: 'conversations:delete', ids: ['https://a.test'] })).toEqual({
      ok: true,
    });
    expect(await savedTurns()).toBe(0);
  });
});
