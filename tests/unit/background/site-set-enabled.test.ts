import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { chromeMock, resetChromeMock } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { withSiteDisabled } from '@/background/contextMenu';
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

type SitePrefs = Settings['sitePrefs'];

const POPUP = {
  id: chromeMock.runtime.id,
  url: 'chrome-extension://ega-test/src/popup/index.html',
};
const contentIn = (url: string): object => ({
  id: chromeMock.runtime.id,
  url,
  tab: { id: 3, windowId: 1, url },
});

function ask(
  msg: { kind: 'site:set-enabled'; enabled: unknown; url?: string },
  sender: object,
): Promise<MsgReply['site:set-enabled']> {
  return new Promise((resolve) => {
    chromeMock.runtime.onMessage.emit(msg, sender, resolve as (r: unknown) => void);
  });
}

async function sitePrefs(): Promise<SitePrefs> {
  const got = await chromeMock.storage.local.get(STORAGE_KEYS.settings);
  return (got[STORAGE_KEYS.settings] as Settings).sitePrefs;
}

beforeEach(async () => {
  resetChromeMock();
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
});

describe('site:set-enabled', () => {
  it('turns the popup-named site off, then on again, leaving no empty row', async () => {
    expect(
      await ask({ kind: 'site:set-enabled', enabled: false, url: 'https://a.test/x' }, POPUP),
    ).toEqual({ ok: true });
    expect((await sitePrefs())['https://a.test']).toEqual({ disabled: true });
    await ask({ kind: 'site:set-enabled', enabled: false, url: 'https://a.test/y' }, POPUP);
    expect((await sitePrefs())['https://a.test']).toEqual({ disabled: true });
    await ask({ kind: 'site:set-enabled', enabled: true, url: 'https://a.test/' }, POPUP);
    expect(await sitePrefs()).not.toHaveProperty('https://a.test');
  });

  it("switches only a content script's own site, whatever url it sends", async () => {
    const reply = await ask(
      { kind: 'site:set-enabled', enabled: false, url: 'https://evil.example/' },
      contentIn('https://page.test/article'),
    );
    expect(reply).toEqual({ ok: true });
    const prefs = await sitePrefs();
    expect(prefs['https://page.test']).toEqual({ disabled: true });
    expect(prefs).not.toHaveProperty('https://evil.example');
  });

  it('refuses a popup request that names no site, and a non-boolean switch', async () => {
    expect(await ask({ kind: 'site:set-enabled', enabled: false }, POPUP)).toEqual({ ok: false });
    expect(
      await ask({ kind: 'site:set-enabled', enabled: 'no', url: 'https://a.test/' }, POPUP),
    ).toEqual({ ok: false });
    expect(
      await ask({ kind: 'site:set-enabled', enabled: false, url: 'chrome://settings' }, POPUP),
    ).toEqual({ ok: false });
    expect(await sitePrefs()).toEqual(DEFAULT_SETTINGS.sitePrefs);
  });
});

describe('withSiteDisabled', () => {
  const origin = fc.constantFrom('https://a.test', 'https://b.test', 'http://c.test');
  const row = fc.record(
    {
      disabled: fc.boolean(),
      defaultLang: fc.constantFrom('es', 'fr'),
      lastDirection: fc.record({ source: fc.constant('es'), target: fc.constant('en') }),
    },
    { requiredKeys: ['disabled'] },
  );

  it('ends each site at the inverse of its last set, and keeps every other field', () => {
    fc.assert(
      fc.property(
        fc.dictionary(origin, row),
        fc.array(fc.tuple(origin, fc.boolean()), { maxLength: 20 }),
        (seed, sets) => {
          const start = seed as SitePrefs;
          let prefs = start;
          for (const [o, enabled] of sets) prefs = withSiteDisabled(prefs, o, () => !enabled);
          const last = new Map(sets);
          for (const o of ['https://a.test', 'https://b.test', 'http://c.test'] as const) {
            const before = start[o];
            const after = prefs[o];
            const enabled = last.get(o);
            if (enabled === undefined) {
              expect(after).toEqual(before);
              continue;
            }
            expect(after?.disabled === true).toBe(!enabled);
            expect(after?.defaultLang).toEqual(before?.defaultLang);
            expect(after?.lastDirection).toEqual(before?.lastDirection);
          }
        },
      ),
    );
  });
});
