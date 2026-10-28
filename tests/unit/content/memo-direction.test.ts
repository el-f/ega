// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chromeMock } from '@tests/mocks/chrome';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { LangSelection, Settings } from '@/shared/types';
import type * as MemoMod from '@/content/memo-direction';
import type * as CacheMod from '@/content/settings-cache';

// A content script cannot join the extension-origin settings lock, so this write goes to the SW.

async function freshModules(): Promise<{ memo: typeof MemoMod; cache: typeof CacheMod }> {
  vi.resetModules();
  return {
    memo: await import('@/content/memo-direction'),
    cache: await import('@/content/settings-cache'),
  };
}

const ar = 'ar' as LangSelection;
const en = 'en' as LangSelection;

describe('memo-direction', () => {
  beforeEach(() => {
    chromeMock.runtime.sendMessage = vi.fn().mockResolvedValue({ ok: true });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'https://example.com' },
    });
  });

  it('sends only the direction to the SW instead of writing storage itself', async () => {
    const { memo, cache } = await freshModules();
    cache.setSettings(DEFAULT_SETTINGS as Settings);
    const setSpy = vi.spyOn(chromeMock.storage.local, 'set');

    await memo.maybeMemoDirection({ source: ar, target: en });

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
      kind: 'site:memo-direction',
      direction: { source: ar, target: en },
    });
    expect(setSpy).not.toHaveBeenCalled();
  });

  // The SW writes the direction onto the stored row, so a site-off the cache has not seen yet survives.
  it('never sends the cached site row', async () => {
    const { memo, cache } = await freshModules();
    cache.setSettings({
      ...DEFAULT_SETTINGS,
      sitePrefs: { 'https://example.com': { disabled: false, defaultLang: 'fr' as LangSelection } },
    } as Settings);

    await memo.maybeMemoDirection({ source: ar, target: en });

    const sent = vi.mocked(chromeMock.runtime.sendMessage).mock.calls.map((c) => c[0] as object);
    expect(sent).toEqual([{ kind: 'site:memo-direction', direction: { source: ar, target: en } }]);
  });

  it('keeps the cache unchanged when the SW refuses', async () => {
    const { memo, cache } = await freshModules();
    chromeMock.runtime.sendMessage = vi.fn().mockResolvedValue({ ok: false, reason: 'schema' });
    cache.setSettings(DEFAULT_SETTINGS as Settings);

    await memo.maybeMemoDirection({ source: ar, target: en });

    expect(cache.currentSettings()?.sitePrefs['https://example.com']).toBeUndefined();
  });

  it('reads the content cache, never chrome.storage', async () => {
    const { memo, cache } = await freshModules();
    cache.setSettings({ ...DEFAULT_SETTINGS } as Settings);
    const getSpy = vi.spyOn(chromeMock.storage.local, 'get');

    await memo.maybeMemoDirection({ source: ar, target: en });

    expect(getSpy).not.toHaveBeenCalled();
  });

  it('writes nothing when the effective direction already matches', async () => {
    const { memo, cache } = await freshModules();
    cache.setSettings({
      ...DEFAULT_SETTINGS,
      defaultLang: ar,
      defaultTargetLang: en,
    } as Settings);

    await memo.maybeMemoDirection({ source: ar, target: en });

    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('remembers an acknowledged direction to avoid a duplicate memo write', async () => {
    const { memo, cache } = await freshModules();
    cache.setSettings(DEFAULT_SETTINGS as Settings);

    await memo.maybeMemoDirection({ source: ar, target: en });
    await memo.maybeMemoDirection({ source: ar, target: en });

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(cache.currentSettings()?.sitePrefs['https://example.com']?.lastDirection).toEqual({
      source: ar,
      target: en,
    });
  });
});
