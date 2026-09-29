import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { exportAll, getCustomLanguages, getSettings } from '@/shared/storage';

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
      { id: 'imp-test-id', label: 'Imported Lang', hint: 'test hint', examples: [], createdAt: 1 },
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
    expect((await getCustomLanguages()).map((c) => c.id)).toEqual(['imp-test-id']);
  });

  it('sniffs a task-presets file and applies it', async () => {
    const status = await importBundleFile(
      fileOf({
        egaTaskPresets: {
          v: 1,
          exportedAt: '2026-05-01T00:00:00.000Z',
          taskTemplates: {},
          taskBackends: { translate: 'auto' },
          taskTemperatures: { translate: 0.7 },
          defaultTask: 'translate',
          defaultTone: 'neutral',
        },
      }),
    );
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Replace task presets?' }),
    );
    expect(status?.msg).toMatch(/0 templates, 1 backend pin, 1 temperature\./);
    expect((await getSettings()).taskTemperatures?.translate).toBe(0.7);
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

  it('reports the unknown backend ids it dropped', async () => {
    const status = await importBundleFile(
      fileOf({
        egaTaskPresets: {
          v: 1,
          exportedAt: '2026-05-01T00:00:00.000Z',
          taskTemplates: {},
          taskBackends: { translate: 'not-a-backend' },
          taskTemperatures: { translate: 0.7 },
          defaultTask: 'translate',
          defaultTone: 'neutral',
        },
      }),
    );
    expect(status?.msg).toBe(
      'Imported 0 templates, 0 backend pins, 1 temperature. Dropped 1 unknown backend id.',
    );
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
        'Skipped 2 unknown entries. Skipped 1 broken custom entry.',
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
    const status = await importBundleFile(
      fileOf({
        egaTaskPresets: {
          v: 1,
          exportedAt: '2026-05-01T00:00:00.000Z',
          taskTemplates: {},
          taskBackends: { translate: 'auto' },
          taskTemperatures: { translate: 0.7 },
          defaultTask: 'translate',
          defaultTone: 'neutral',
        },
      }),
      'varieties',
    );
    expect(status?.kind).toBe('err');
    expect(status?.msg).toMatch(/task-presets file/);
    expect(confirmDialog).not.toHaveBeenCalled();
    expect((await getSettings()).taskTemperatures?.translate).toBeUndefined();
  });

  it('a varieties file still imports on the varieties row', async () => {
    const status = await importBundleFile(fileOf(VARIETIES), 'varieties');
    expect(status?.kind).toBe('ok');
    expect((await getCustomLanguages()).map((c) => c.id)).toEqual(['imp-test-id']);
  });
});

it('the import parser is options-only', async () => {
  expect('parseImportBundle' in (await import('@/shared/storage'))).toBe(false);
  expect(typeof (await import('@/options/import-bundle')).parseImportBundle).toBe('function');
});
