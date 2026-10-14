import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCustomLanguages, getSettings } from '@/shared/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

beforeEach(async () => {
  await chrome.storage.local.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('getCustomLanguages', () => {
  it('drops an unusable row, keeps a stored row the schema rejects, and the rest', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.customLanguages]: [
        {},
        { id: 'not a uuid!', label: 'x', hint: '', examples: [], createdAt: 1 },
        {
          id: '11111111-1111-4111-8111-111111111111',
          label: 'WoW jargon',
          hint: 'WoW raid',
          examples: [],
          createdAt: 1,
        },
      ],
    });
    const list = await getCustomLanguages();
    // The bad-id row is stored data: dropping it on read would delete it on the next write.
    expect(list.map((l) => l.label)).toEqual(['x', 'WoW jargon']);
  });

  it('stamps createdAt on a row that lacks it', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.customLanguages]: [
        { id: '22222222-2222-4222-8222-222222222222', label: 'Old row', hint: '', examples: [] },
      ],
    });
    const list = await getCustomLanguages();
    expect(list).toHaveLength(1);
    expect(typeof list[0]?.createdAt).toBe('number');
  });
});

describe('a stored language with two subtags', () => {
  it('survives a read instead of resetting to English', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, defaultTargetLang: 'zh-Hant-TW' },
    });
    expect((await getSettings()).defaultTargetLang).toBe('zh-Hant-TW');
  });
});
