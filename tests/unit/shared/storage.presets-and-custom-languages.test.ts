import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportTaskPresets, getCustomLanguages, getSettings } from '@/shared/storage';
import { importAs } from '@tests/_helpers/import-bundle';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

beforeEach(async () => {
  await chrome.storage.local.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('task presets import', () => {
  it('lands as one settings write', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: {
        ...DEFAULT_SETTINGS,
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          taskTemplates: { summarize: { system: 'CUST', user: 'U {{text}}' } },
          taskTones: { reword: 'blunt' },
        },
        taskTemperatures: { summarize: 0.5 },
        defaultTask: 'reword',
      },
    });
    const bundle = await exportTaskPresets();
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS } });

    const set = vi.spyOn(chrome.storage.local, 'set');
    await importAs(bundle, 'taskPresets');
    const settingsWrites = set.mock.calls.filter((c) =>
      Object.keys(c[0] as Record<string, unknown>).includes(STORAGE_KEYS.settings),
    );
    expect(settingsWrites).toHaveLength(1);

    const s = await getSettings();
    expect(s.advanced.taskTemplates.summarize?.system).toBe('CUST');
    expect(s.advanced.taskTones.reword).toBe('blunt');
    expect(s.taskTemperatures?.summarize).toBe(0.5);
    expect(s.defaultTask).toBe('reword');
  });
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
