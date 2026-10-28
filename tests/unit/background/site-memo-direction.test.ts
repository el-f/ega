import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { MsgReply } from '@/shared/messages';
import type { Settings } from '@/shared/types';

vi.mock('@/background/router', () => ({
  createRouter: vi.fn(() => ({
    handleTranslate: vi.fn(),
    cancel: vi.fn(),
    cancelAll: vi.fn(),
    clearProbes: vi.fn(),
  })),
  settingsToConfig: vi.fn(),
}));
vi.mock('@/background/pre-warm', () => ({ resolvePreWarmProvider: vi.fn().mockReturnValue(null) }));
vi.mock('@/shared/cli-session/port-manager', () => ({
  getStatus: vi.fn().mockReturnValue('warm'),
  warm: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/background/native-test', () => ({ handleNativeTest: vi.fn() }));

await import('@/background/index');

const SITE = 'https://example.com';
const CONTENT = { id: chromeMock.runtime.id, url: `${SITE}/a/b`, tab: { id: 3, url: SITE } };
const POPUP = { id: chromeMock.runtime.id, url: 'chrome-extension://ega-test/src/popup/index.html' };
const DIRECTION = { source: 'arabizi', target: 'en' };

function memo(direction: unknown, sender: object): Promise<MsgReply['site:memo-direction']> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no reply')), 2000);
    chromeMock.runtime.onMessage.emit({ kind: 'site:memo-direction', direction }, sender, (r) => {
      clearTimeout(timer);
      resolve(r as MsgReply['site:memo-direction']);
    });
  });
}

async function stored(): Promise<Settings> {
  const got = await chromeMock.storage.local.get(STORAGE_KEYS.settings);
  return got[STORAGE_KEYS.settings] as Settings;
}

beforeEach(async () => {
  resetChromeMock();
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
});

describe('site:memo-direction', () => {
  // The content cache may still hold the row from before a site-off; the worker reads the stored one.
  it('sets the direction on the stored row and keeps a site-off and a source written since', async () => {
    await chromeMock.storage.local.set({
      [STORAGE_KEYS.settings]: {
        ...DEFAULT_SETTINGS,
        anthropicApiKey: 'sk-ant',
        sitePrefs: { [SITE]: { disabled: true, defaultLang: 'fr' } },
      },
    });

    const ack = await memo(DIRECTION, CONTENT);

    expect((await stored()).sitePrefs[SITE]).toEqual({
      disabled: true,
      defaultLang: 'fr',
      lastDirection: DIRECTION,
    });
    expect(ack.ok).toBe(true);
    expect(ack.settings?.sitePrefs[SITE]?.lastDirection).toEqual(DIRECTION);
    expect(ack.settings).not.toHaveProperty('anthropicApiKey');
  });

  it('starts a row for a site that has none', async () => {
    expect((await memo(DIRECTION, CONTENT)).ok).toBe(true);
    expect((await stored()).sitePrefs[SITE]).toEqual({ disabled: false, lastDirection: DIRECTION });
  });

  it('refuses a sender with no tab, which names no site', async () => {
    expect(await memo(DIRECTION, POPUP)).toEqual({ ok: false, reason: 'schema' });
    expect((await stored()).sitePrefs).toEqual({});
  });

  it.each([
    ['a missing target', { source: 'en' }],
    ['a number', { source: 'en', target: 5 }],
    ['an extra key', { ...DIRECTION, disabled: false }],
    ['no direction', undefined],
  ])('refuses %s', async (_name, direction) => {
    expect(await memo(direction, CONTENT)).toEqual({ ok: false, reason: 'schema' });
    expect((await stored()).sitePrefs).toEqual({});
  });
});
