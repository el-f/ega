import { describe, it, expect } from 'vitest';
import { getSettings, updateSettings, getCustomLanguages } from '@/shared/storage';
import { CUSTOM_LANGUAGES_MAX } from '@/shared/storage/sanitise';
import { importAs } from '@tests/_helpers/import-bundle';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import type { Settings } from '@/shared/types';

const bid = (s: string) => asBackendIdUnsafe(s);

describe('updateSettings returns the same fields the next read produces', () => {
  it('reordering backendOrder round-trips through write and read', async () => {
    const cur = await getSettings();
    const reversed = [...cur.backendOrder].reverse();
    const returned = await updateSettings({ backendOrder: reversed });
    const reread = await getSettings();
    expect(returned.backendOrder).toEqual(reread.backendOrder);
  });

  it('disabling a backend round-trips through write and read', async () => {
    const returned = await updateSettings({
      disabledBackends: [...(await getSettings()).disabledBackends, bid('anthropic')],
    });
    const reread = await getSettings();
    expect(returned.disabledBackends).toEqual(reread.disabledBackends);
    expect(reread.disabledBackends).toContain('anthropic');
  });

  it('still refuses a patch that disables every backend', async () => {
    const cur = await getSettings();
    await expect(updateSettings({ disabledBackends: [...cur.backendOrder] })).rejects.toThrow(
      /At least one backend/,
    );
  });
});

describe('getSettings survives a corrupt customLanguages row', () => {
  it('a non-array row reads as no custom languages instead of throwing', async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.customLanguages]: { nope: true } });
    await expect(getCustomLanguages()).resolves.toEqual([]);
    const s = await getSettings();
    expect(s.defaultTargetLang).toBe(DEFAULT_SETTINGS.defaultTargetLang);
  });

  it('keeps language references while the stored list is unreadable, through a later save', async () => {
    const id = '9b2e4f1a-0c3d-4e5f-8a6b-7c8d9e0f1a2b';
    await chrome.storage.local.set({
      [STORAGE_KEYS.customLanguages]: { nope: true },
      [STORAGE_KEYS.settings]: {
        defaultLang: id,
        defaultTargetLang: id,
        disabledVarieties: [id],
        sitePrefs: { 'https://a.example': { lastDirection: { source: id, target: 'en' } } },
      },
    });
    await updateSettings({ theme: 'dark' });
    const stored = (await chrome.storage.local.get(STORAGE_KEYS.settings))[
      STORAGE_KEYS.settings
    ] as Settings;
    expect(stored.defaultLang).toBe(id);
    expect(stored.defaultTargetLang).toBe(id);
    expect(stored.disabledVarieties).toEqual([id]);
    expect(stored.sitePrefs['https://a.example']?.lastDirection?.source).toBe(id);
  });

  it('entries that are not objects are dropped, the good ones survive', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.customLanguages]: [
        null,
        'nope',
        { id: 'arabizi-x', label: 'X', hint: '', examples: [], createdAt: 1 },
      ],
    });
    const list = await getCustomLanguages();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('arabizi-x');
    await expect(getSettings()).resolves.toBeDefined();
  });
});

describe('a varieties import respects the custom-languages cap', () => {
  const lang = (i: number) => ({
    id: `bulk-${i}`,
    label: `Bulk ${i}`,
    hint: 'h',
    examples: [],
    createdAt: 1,
  });

  it('caps the written list and reports the number it actually kept', async () => {
    const bundle = {
      egaVarieties: {
        v: 1 as const,
        exportedAt: '2026-08-11',
        customLanguages: Array.from({ length: CUSTOM_LANGUAGES_MAX + 50 }, (_, i) => lang(i)),
        varietyOverrides: {},
        disabledVarieties: [],
      },
    };
    const { result } = await importAs(bundle, 'varieties');
    expect(result.customLanguagesAdded).toBe(CUSTOM_LANGUAGES_MAX);
    const stored = (await chrome.storage.local.get(STORAGE_KEYS.customLanguages))[
      STORAGE_KEYS.customLanguages
    ] as unknown[];
    expect(stored).toHaveLength(CUSTOM_LANGUAGES_MAX);
  });
});

describe('a settings import absorbs unknown keys in a bundle', () => {
  it('a bundle carrying unknown keys imports; the keys are dropped, invalid fields reset', async () => {
    const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    settings['schemaVersion'] = 1;
    settings['streamingMode'] = 'buffered';
    await importAs(
      { version: 1, exportedAt: '2026-01-01', settings, customLanguages: [] },
      'settings',
    );
    const s = (await getSettings()) as unknown as Record<string, unknown>;
    expect(s['schemaVersion']).toBeUndefined();
    expect(s['streamingMode']).toBeUndefined();
    expect(s['theme']).toBe(DEFAULT_SETTINGS.theme);
  });
});

describe('optional settings keys stay absent rather than present-and-undefined', () => {
  const API_KEY_FIELDS = [
    'anthropicApiKey',
    'openaiApiKey',
    'geminiApiKey',
    'groqApiKey',
    'deepseekApiKey',
    'togetherApiKey',
    'mistralApiKey',
    'xaiApiKey',
    'fireworksApiKey',
    'openrouterApiKey',
  ];

  it('an explicit undefined on disk is deleted on read, for every provider alike', async () => {
    const raw: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const k of API_KEY_FIELDS) raw[k] = undefined;
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: raw });
    const s = (await getSettings()) as unknown as Record<string, unknown>;
    expect(API_KEY_FIELDS.filter((k) => Object.hasOwn(s, k))).toEqual([]);
  });

  it('a real key value still survives the strip', async () => {
    await updateSettings({ togetherApiKey: 'sk-together' });
    const s = await getSettings();
    expect(s.togetherApiKey).toBe('sk-together');
  });
});

describe('a settings import writes what the read path would produce', () => {
  it('drops a dangling variety ref at import time, not on the next read', async () => {
    const settings: Record<string, unknown> = {
      ...DEFAULT_SETTINGS,
      disabledVarieties: ['no-such-variety'],
      sitePrefs: { 'example.com': { disabled: true } },
    };
    await importAs(
      { version: 1, exportedAt: '2026-01-01', settings, customLanguages: [] },
      'settings',
    );
    const raw = (await chrome.storage.local.get(STORAGE_KEYS.settings))[STORAGE_KEYS.settings] as {
      disabledVarieties: string[];
      sitePrefs: Record<string, unknown>;
    };
    expect(raw.disabledVarieties).toEqual([]);
    expect(Object.keys(raw.sitePrefs).sort()).toEqual([
      'http://example.com',
      'https://example.com',
    ]);
  });

  it('keeps a ref to a custom language the same bundle carries', async () => {
    const settings: Record<string, unknown> = {
      ...DEFAULT_SETTINGS,
      disabledVarieties: ['custom-bundled'],
    };
    await importAs(
      {
        version: 1,
        exportedAt: '2026-01-01',
        settings,
        customLanguages: [
          { id: 'custom-bundled', label: 'Bundled', hint: 'h', examples: [], createdAt: 1 },
        ],
      },
      'settings',
    );
    expect((await getSettings()).disabledVarieties).toEqual(['custom-bundled']);
  });
});
