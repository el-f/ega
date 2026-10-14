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

  it('sends settings:update instead of writing storage itself', async () => {
    const { memo, cache } = await freshModules();
    cache.setSettings(DEFAULT_SETTINGS as Settings);
    const setSpy = vi.spyOn(chromeMock.storage.local, 'set');

    await memo.maybeMemoDirection({ source: ar, target: en });

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
      kind: 'settings:update',
      patch: {
        sitePrefs: {
          'https://example.com': { disabled: false, lastDirection: { source: ar, target: en } },
        },
      },
    });
    expect(setSpy).not.toHaveBeenCalled();
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
