import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { getCustomLanguages, getSettings } from '@/shared/storage';
import { exportAll } from '@/shared/storage/backup';
import { DETECT_PATTERN_MAX, VARIETY_HINT_MAX } from '@/shared/settings-schema';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

import { importBundleFile } from '@/options/import-bundle';

function fileOf(content: unknown): File {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return new File([text], 'bundle.json', { type: 'application/json' });
}

const VARIETIES = {
  egaVarieties: {
    v: 1,
    exportedAt: '2026-05-01T00:00:00.000Z',
    customLanguages: [
      {
        id: 'imported-test-id',
        label: 'Imported Lang',
        hint: 'test hint',
        examples: [],
        createdAt: 1,
      },
    ],
    varietyOverrides: {},
    disabledVarieties: [],
  },
};

describe('importBundleFile — parse before confirm', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.mocked(confirmDialog).mockClear();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('a file that is not JSON fails without asking', async () => {
    const setSpy = vi.spyOn(chromeMock.storage.local, 'set');
    const status = await importBundleFile(fileOf('not json {'));
    expect(status?.kind).toBe('err');
    expect(status?.msg).toMatch(/valid JSON/);
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('JSON with no Ega root key fails without asking', async () => {
    const status = await importBundleFile(fileOf({ hello: 'world' }));
    expect(status?.msg).toMatch(/not an Ega export/);
    expect(confirmDialog).not.toHaveBeenCalled();
  });

  it('a bundle that fails its schema fails without asking', async () => {
    const status = await importBundleFile(
      fileOf({ egaVarieties: { ...VARIETIES.egaVarieties, v: 99 } }),
    );
    expect(status?.kind).toBe('err');
    expect(status?.msg).toMatch(/different Ega version/);
    expect(confirmDialog).not.toHaveBeenCalled();
  });

  it('canceling the confirm writes nothing and reports nothing', async () => {
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    const setSpy = vi.spyOn(chromeMock.storage.local, 'set');
    const status = await importBundleFile(fileOf(VARIETIES));
    expect(status).toBeNull();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('the whole-backup row sniffs a varieties file and shows the varieties confirm', async () => {
    const status = await importBundleFile(fileOf(VARIETIES));
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Replace your custom languages and edits?' }),
    );
    expect(status).toEqual({ kind: 'ok', msg: expect.stringMatching(/1 custom language/) });
    expect((await getCustomLanguages()).map((c) => c.id)).toEqual(['imported-test-id']);
  });

  it('refuses an old task-presets file before any confirm and writes nothing', async () => {
    const setSpy = vi.spyOn(chromeMock.storage.local, 'set');
    const status = await importBundleFile(
      fileOf({
        egaTaskPresets: {
          v: 1,
          exportedAt: '2026-05-01T00:00:00.000Z',
          taskTemplates: {},
          defaultTask: 'translate',
          defaultTone: 'neutral',
        },
      }),
    );
    expect(status).toEqual({
      kind: 'err',
      msg: 'Import failed: This is an old task-presets file. Import a full backup instead.',
    });
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('a full backup asks twice and honors "Strip keys"', async () => {
    await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: { openaiApiKey: 'mine' } });
    const bundle = await exportAll({ includeApiKeys: true });
    const file = fileOf({
      ...bundle,
      settings: { ...bundle.settings, openaiApiKey: 'theirs', theme: 'dark' },
    });
    vi.mocked(confirmDialog).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const status = await importBundleFile(file);
    expect(status?.msg).toBe('Imported all settings.');
    expect(confirmDialog).toHaveBeenCalledTimes(2);
    const after = await getSettings();
    expect(after.theme).toBe('dark');
    expect(after.openaiApiKey).toBe('mine');
  });

  it('a keyless backup keeps a Gemini 2.5 pick that the current key still serves', async () => {
    await chromeMock.storage.local.set({
      [STORAGE_KEYS.settings]: { geminiApiKey: 'old-key', model: { gemini: 'gemini-2.5-flash' } },
    });
    const status = await importBundleFile(fileOf(await exportAll()));
    expect(status?.kind).not.toBe('err');
    // The file has no keys, so there is nothing to keep and no second question.
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    const after = await getSettings();
    expect(after.geminiApiKey).toBe('old-key');
    expect(after.model.gemini).toBe('gemini-2.5-flash');
  });

  it('imports a version 2 full backup, the shape a backup with task data has', async () => {
    const bundle = await exportAll();
    const status = await importBundleFile(
      fileOf({ ...bundle, version: 2, settings: { ...bundle.settings, theme: 'dark' } }),
    );
    expect(status?.kind).toBe('ok');
    expect((await getSettings()).theme).toBe('dark');
  });

  it('stores a menu item whose surface no longer matches its id under an id that encodes it', async () => {
    const bundle = await exportAll();
    const items = bundle.settings.contextMenuItems.map((i) =>
      i.id === 'ega-translate-image' ? { ...i, surface: 'tooltip' as const } : i,
    );
    const status = await importBundleFile(
      fileOf({ ...bundle, settings: { ...bundle.settings, contextMenuItems: items } }),
    );
    expect(status?.kind).toBe('ok');
    const stored = (await getSettings()).contextMenuItems;
    // The click decides the side panel from the id alone, so the stored id must say tooltip.
    expect(stored.map((i) => i.id)).not.toContain('ega-translate-image');
    expect(stored.find((i) => i.kind === 'image-task' && i.task === 'translate')?.id).toMatch(
      /^ega-custom-img-tt-/,
    );
  });

  it('a write that fails after the confirm reports Import failed', async () => {
    const set = vi
      .spyOn(chromeMock.storage.local, 'set')
      .mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));
    try {
      const status = await importBundleFile(fileOf(VARIETIES));
      expect(confirmDialog).toHaveBeenCalledTimes(1);
      expect(status).toEqual({ kind: 'err', msg: expect.stringMatching(/^Import failed: /) });
    } finally {
      set.mockRestore();
    }
  });

  it('reports the varieties entries it skipped and the broken ones', async () => {
    const status = await importBundleFile(
      fileOf({
        egaVarieties: {
          ...VARIETIES.egaVarieties,
          customLanguages: [...VARIETIES.egaVarieties.customLanguages, { id: 'broken-entry' }],
          varietyOverrides: { 'ghost-id': { label: 'Ghost' } },
          disabledVarieties: ['no-such-id'],
        },
      }),
    );
    expect(status?.msg).toBe(
      'Imported 1 custom language, 0 overrides, 0 disabled languages. ' +
        'Skipped 2 unknown entries. Skipped 1 broken entry.',
    );
  });

  it('JSON that is not an object fails with the same friendly message', async () => {
    const status = await importBundleFile(fileOf([1, 2, 3]));
    expect(status?.kind).toBe('err');
    expect(status?.msg).toMatch(/not an Ega export/);
    expect(confirmDialog).not.toHaveBeenCalled();
  });
});

describe('importBundleFile — a row only imports the kind it advertises', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.mocked(confirmDialog).mockClear();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('a full backup picked on the varieties row is refused before any confirm', async () => {
    await chromeMock.storage.local.set({
      [STORAGE_KEYS.settings]: { theme: 'light' },
      [STORAGE_KEYS.customLanguages]: [
        { id: 'mine', label: 'Mine', hint: 'h', examples: [], createdAt: 1 },
      ],
    });
    const setSpy = vi.spyOn(chromeMock.storage.local, 'set');
    const status = await importBundleFile(fileOf(await exportAll()), 'varieties');
    expect(status?.kind).toBe('err');
    expect(status?.msg).toMatch(/full settings backup/);
    expect(status?.msg).toMatch(/nothing was changed/i);
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
    expect((await getCustomLanguages()).map((c) => c.id)).toEqual(['mine']);
  });

  it('a task-presets file picked on the varieties row is refused before any confirm', async () => {
    const setSpy = vi.spyOn(chromeMock.storage.local, 'set');
    const status = await importBundleFile(
      fileOf({
        egaTaskPresets: {
          v: 1,
          exportedAt: '2026-05-01T00:00:00.000Z',
          taskTemplates: {},
          defaultTask: 'translate',
          defaultTone: 'neutral',
        },
      }),
      'varieties',
    );
    expect(status?.kind).toBe('err');
    expect(status?.msg).toMatch(/old task-presets file/);
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('a varieties file still imports on the varieties row', async () => {
    const status = await importBundleFile(fileOf(VARIETIES), 'varieties');
    expect(status?.kind).toBe('ok');
    expect((await getCustomLanguages()).map((c) => c.id)).toEqual(['imported-test-id']);
  });
});

describe('importBundleFile — a languages file is read as leniently as a tasks file', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.mocked(confirmDialog).mockClear();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('ignores keys this build does not know, at the root and in the file', async () => {
    const status = await importBundleFile(
      fileOf({ egaVarieties: { ...VARIETIES.egaVarieties, futureField: 1 }, extra: true }),
      'varieties',
    );
    expect(status?.kind).toBe('ok');
    expect((await getCustomLanguages()).map((c) => c.id)).toEqual(['imported-test-id']);
  });

  it('skips one broken edit and imports the rest of the file', async () => {
    const status = await importBundleFile(
      fileOf({
        egaVarieties: {
          ...VARIETIES.egaVarieties,
          varietyOverrides: { arabizi: 'oops', 'elvish-quenya': { hint: 'mine' } },
          disabledVarieties: [7, 'elvish-quenya'],
        },
      }),
      'varieties',
    );
    expect(status?.msg).toBe(
      'Imported 1 custom language, 1 override, 1 disabled language. Skipped 2 broken entries.',
    );
    const s = await getSettings();
    expect(s.varietyOverrides).toEqual({ 'elvish-quenya': { hint: 'mine' } });
    expect(s.disabledVarieties).toEqual(['elvish-quenya']);
  });

  it('clamps a long field and stamps a missing date instead of dropping the language', async () => {
    const { createdAt: _drop, ...noStamp } = VARIETIES.egaVarieties.customLanguages[0] ?? {};
    void _drop;
    const status = await importBundleFile(
      fileOf({
        egaVarieties: {
          ...VARIETIES.egaVarieties,
          customLanguages: [{ ...noStamp, hint: 'h'.repeat(VARIETY_HINT_MAX + 50) }],
        },
      }),
      'varieties',
    );
    expect(status?.kind).toBe('ok');
    const [lang] = await getCustomLanguages();
    expect(lang?.hint).toHaveLength(VARIETY_HINT_MAX);
    expect(typeof lang?.createdAt).toBe('number');
  });

  it('keeps your edits, off list and prompts when the file leaves a part out or breaks it', async () => {
    await chromeMock.storage.local.set({
      [STORAGE_KEYS.settings]: {
        varietyOverrides: { arabizi: { hint: 'mine' } },
        disabledVarieties: ['leetspeak'],
        advanced: { perPresetTemplates: { arabizi: { system: 'Mine.' } } },
      },
    });
    const { varietyOverrides: _o, disabledVarieties: _d, ...rest } = VARIETIES.egaVarieties;
    void _o;
    void _d;
    const status = await importBundleFile(
      fileOf({ egaVarieties: { ...rest, v: 2, presetTemplates: 'x' } }),
      'varieties',
    );
    expect(status?.kind).toBe('ok');
    const s = await getSettings();
    expect(s.varietyOverrides).toEqual({ arabizi: { hint: 'mine' } });
    expect(s.disabledVarieties).toEqual(['leetspeak']);
    expect(s.advanced.perPresetTemplates).toEqual({ arabizi: { system: 'Mine.' } });
  });

  it('drops a custom language whose id reads as a language code', async () => {
    const lang = VARIETIES.egaVarieties.customLanguages[0];
    const status = await importBundleFile(
      fileOf({
        egaVarieties: {
          ...VARIETIES.egaVarieties,
          customLanguages: [lang, { ...lang, id: 'en' }, { ...lang, id: 'auto' }],
        },
      }),
      'varieties',
    );
    expect(status?.msg).toMatch(/Dropped 2 custom entries whose id reads as a language code/);
    expect((await getCustomLanguages()).map((c) => c.id)).toEqual(['imported-test-id']);
  });

  it('drops a detection pattern over its limit instead of cutting it', async () => {
    const lang = VARIETIES.egaVarieties.customLanguages[0];
    const status = await importBundleFile(
      fileOf({
        egaVarieties: {
          ...VARIETIES.egaVarieties,
          customLanguages: [
            {
              ...lang,
              autoDetect: { regex: 'a'.repeat(DETECT_PATTERN_MAX + 1), flags: '', minScore: 1 },
            },
          ],
          varietyOverrides: {
            arabizi: {
              hint: 'h',
              autoDetect: { regex: 'b'.repeat(DETECT_PATTERN_MAX + 1), flags: '', minScore: 1 },
            },
          },
        },
      }),
      'varieties',
    );
    expect(status?.msg).toMatch(/Skipped 2 broken entries/);
    expect((await getCustomLanguages())[0]?.autoDetect).toBeUndefined();
    expect((await getSettings()).varietyOverrides).toEqual({ arabizi: { hint: 'h' } });
  });

  it('a map or list of the wrong type counts as one broken part', async () => {
    const status = await importBundleFile(
      fileOf({
        egaVarieties: { ...VARIETIES.egaVarieties, varietyOverrides: [], disabledVarieties: 'x' },
      }),
      'varieties',
    );
    expect(status?.msg).toBe('Imported 1 custom language. Skipped 2 broken entries.');
  });

  it('keeps a code-like id for a language you already have, and names only what it replaces', async () => {
    const lang = VARIETIES.egaVarieties.customLanguages[0];
    await chromeMock.storage.local.set({
      [STORAGE_KEYS.customLanguages]: [{ ...lang, id: 'my-lang', label: 'Old' }],
    });
    const { varietyOverrides: _o, ...rest } = VARIETIES.egaVarieties;
    void _o;
    const status = await importBundleFile(
      fileOf({ egaVarieties: { ...rest, customLanguages: [{ ...lang, id: 'my-lang' }] } }),
      'varieties',
    );
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining(
          'Importing replaces your custom languages and which languages are off.',
        ),
      }),
    );
    expect(status?.msg).toBe('Imported 1 custom language, 0 disabled languages.');
    expect((await getCustomLanguages()).map((c) => [c.id, c.label])).toEqual([
      ['my-lang', 'Imported Lang'],
    ]);
  });

  it('reads a language prompt with a key this build does not know', async () => {
    const status = await importBundleFile(
      fileOf({
        egaVarieties: {
          ...VARIETIES.egaVarieties,
          v: 2,
          presetTemplates: { arabizi: { system: 'Mine.', future: 1 } },
        },
      }),
      'varieties',
    );
    expect(status?.msg).toMatch(/1 language prompt/);
    expect((await getSettings()).advanced.perPresetTemplates).toEqual({
      arabizi: { system: 'Mine.' },
    });
  });

  it('a full backup keeps your own code-like language and drops an over-long pattern on a built-in edit', async () => {
    const lang = VARIETIES.egaVarieties.customLanguages[0];
    const mine = { ...lang, id: 'my-lang', label: 'Mine' };
    await chromeMock.storage.local.set({ [STORAGE_KEYS.customLanguages]: [mine] });
    const bundle = await exportAll();
    const status = await importBundleFile(
      fileOf({
        ...bundle,
        customLanguages: [mine, { ...lang, id: 'en-new', label: 'New' }],
        settings: {
          ...bundle.settings,
          varietyOverrides: {
            arabizi: {
              hint: 'h',
              autoDetect: { regex: 'b'.repeat(DETECT_PATTERN_MAX + 1), flags: '', minScore: 1 },
            },
          },
        },
      }),
    );
    expect(status?.kind).toBe('ok');
    expect((await getCustomLanguages()).map((c) => c.id)).toEqual(['my-lang']);
    expect((await getSettings()).varietyOverrides).toEqual({ arabizi: { hint: 'h' } });
  });

  it('a full backup drops a new code-like language with its prompt, defaults and glossary scopes, and says so', async () => {
    const lang = VARIETIES.egaVarieties.customLanguages[0];
    const bundle = await exportAll();
    const status = await importBundleFile(
      fileOf({
        ...bundle,
        customLanguages: [{ ...lang, id: 'pt-BR', label: 'Mine' }],
        settings: {
          ...bundle.settings,
          defaultLang: 'pt-BR',
          defaultTargetLang: 'pt-BR',
          advanced: {
            ...bundle.settings.advanced,
            perPresetTemplates: { 'pt-BR': { system: 'x' } },
          },
          glossary: [
            { term: 'a', translation: 'b', sourceLang: 'pt-BR', caseSensitive: false },
            { term: 'c', translation: 'd', sourceLang: 'en', caseSensitive: false },
          ],
        },
      }),
    );
    expect(status?.msg).toBe(
      'Imported all settings. Dropped 1 custom language whose id reads as a language code, with the settings that named it.',
    );
    const s = await getSettings();
    expect(await getCustomLanguages()).toEqual([]);
    expect(s.defaultLang).toBe('auto');
    expect(s.defaultTargetLang).toBe(DEFAULT_SETTINGS.defaultTargetLang);
    expect(s.advanced.perPresetTemplates).toEqual({});
    expect(s.glossary.map((e) => e.term)).toEqual(['c']);
  });
});

it('the import parser is options-only', async () => {
  expect('parseImportBundle' in (await import('@/shared/storage'))).toBe(false);
  expect(typeof (await import('@/options/import-bundle')).parseImportBundle).toBe('function');
});
