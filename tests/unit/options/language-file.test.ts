import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { getCustomLanguages, getSettings } from '@/shared/storage';
import { exportLanguage } from '@/shared/storage/backup';
import { parseSettings } from '@/shared/settings-schema';
import { CUSTOM_LANGUAGES_MAX } from '@/shared/storage/sanitise';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

import { importBundleFile } from '@/options/import-bundle';

function fileOf(content: unknown): File {
  return new File([JSON.stringify(content)], 'language.json', { type: 'application/json' });
}

const PIRATE = {
  id: '5e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b',
  label: 'Pirate',
  hint: 'Talk like a pirate',
  examples: [{ src: 'ahoy', tgt: 'hello' }],
  autoDetect: { regex: '\\bahoy\\b', flags: 'i', minScore: 1 },
  createdAt: 1,
};
const OTHER = { id: 'other-lang-id', label: 'Other', hint: 'h', examples: [], createdAt: 2 };

function seed(customs: unknown[], advanced: Record<string, unknown> = {}): void {
  chromeMock.storage.local._raw.set(STORAGE_KEYS.customLanguages, customs);
  chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, parseSettings({ advanced }));
}

const languageFile = (over: Record<string, unknown> = {}) => ({
  egaLanguage: { v: 1, exportedAt: '2026-10-02T00:00:00.000Z', language: PIRATE, ...over },
});

describe('one language as a file', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.mocked(confirmDialog).mockClear();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('exports one custom language with its examples, pattern and own prompt', async () => {
    seed([PIRATE, OTHER], { perPresetTemplates: { [PIRATE.id]: { system: 'Yarr.' } } });
    const bundle = await exportLanguage(PIRATE.id);
    expect(bundle.egaLanguage).toMatchObject({
      v: 1,
      language: PIRATE,
      prompt: { system: 'Yarr.' },
    });
  });

  it('adds the language next to yours, with its prompt', async () => {
    seed([OTHER]);
    const status = await importBundleFile(
      fileOf(languageFile({ prompt: { system: 'Yarr.' } })),
      'language',
    );
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Add "Pirate"?', confirmLabel: 'Add' }),
    );
    expect(status).toEqual({
      kind: 'ok',
      msg: 'Added "Pirate". Its detection pattern was not imported.',
    });
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('could claim text on every page') }),
    );
    const customs = await getCustomLanguages();
    expect(customs.map((c) => c.id)).toEqual([OTHER.id, PIRATE.id]);
    expect(customs[1]?.autoDetect).toBeUndefined();
    expect((await getSettings()).advanced.perPresetTemplates[PIRATE.id]).toEqual({
      system: 'Yarr.',
    });
  });

  it('replaces a language with the same id after a danger confirm, and keeps its prompt when the file has none', async () => {
    seed([{ ...PIRATE, hint: 'old hint' }, OTHER], {
      perPresetTemplates: { [PIRATE.id]: { system: 'Mine.' } },
    });
    const status = await importBundleFile(fileOf(languageFile()), ['varieties', 'language']);
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Replace "Pirate"?', danger: true }),
    );
    expect(status).toEqual({ kind: 'ok', msg: 'Replaced "Pirate".' });
    const customs = await getCustomLanguages();
    expect(customs.map((c) => [c.id, c.hint])).toEqual([
      [PIRATE.id, PIRATE.hint],
      [OTHER.id, OTHER.hint],
    ]);
    expect((await getSettings()).advanced.perPresetTemplates[PIRATE.id]).toEqual({
      system: 'Mine.',
    });
  });

  it('refuses a language that takes a built-in id', async () => {
    const status = await importBundleFile(
      fileOf(languageFile({ language: { ...PIRATE, id: 'arabizi' } })),
      'language',
    );
    expect(status?.kind).toBe('err');
    expect(status?.msg).toMatch(/built-in language/);
    expect(confirmDialog).not.toHaveBeenCalled();
  });

  it('refuses an id that reads as a language code or as Auto-detect', async () => {
    for (const id of ['auto', 'en', 'pt-BR']) {
      const status = await importBundleFile(
        fileOf(languageFile({ language: { ...PIRATE, id }, prompt: { system: 'x' } })),
        'language',
      );
      expect(status?.kind).toBe('err');
      expect(status?.msg).toMatch(/language code/);
    }
    expect(confirmDialog).not.toHaveBeenCalled();
    expect((await getSettings()).advanced.perPresetTemplates).toEqual({});
  });

  it('keeps the prompt when the file adds a key this build does not know', async () => {
    seed([]);
    const status = await importBundleFile(
      fileOf(languageFile({ prompt: { system: 'Yarr.', future: true } })),
      'language',
    );
    expect(status?.kind).toBe('ok');
    expect((await getSettings()).advanced.perPresetTemplates[PIRATE.id]).toEqual({
      system: 'Yarr.',
    });
  });

  it('says when the file prompt is broken and leaves it out', async () => {
    seed([]);
    const status = await importBundleFile(fileOf(languageFile({ prompt: 'x' })), 'language');
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('Its prompt is broken') }),
    );
    expect(status?.msg).toBe(
      'Added "Pirate". Its prompt was broken and was left out. Its detection pattern was not imported.',
    );
    expect((await getSettings()).advanced.perPresetTemplates).toEqual({});
  });

  it('keeps your own detection pattern on replace, and never takes the file one', async () => {
    const mine = { regex: 'yarr', flags: '', minScore: 2 };
    seed([{ ...PIRATE, autoDetect: mine }]);
    await importBundleFile(fileOf(languageFile()), 'language');
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('Your detection pattern stays.') }),
    );
    expect((await getCustomLanguages())[0]?.autoDetect).toEqual(mine);

    vi.mocked(confirmDialog).mockClear();
    const { autoDetect: _none, ...noPattern } = PIRATE;
    seed([noPattern]);
    const status = await importBundleFile(fileOf(languageFile()), 'language');
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("The file's detection pattern is not imported."),
      }),
    );
    expect(status?.msg).toBe('Replaced "Pirate". Its detection pattern was not imported.');
    expect((await getCustomLanguages())[0]?.autoDetect).toBeUndefined();
  });

  it('replaces a language you already have even when its id reads as a language code', async () => {
    seed([{ ...PIRATE, id: 'my-pirate', label: 'Old' }]);
    const status = await importBundleFile(
      fileOf(languageFile({ language: { ...PIRATE, id: 'my-pirate' } })),
      'language',
    );
    expect(status).toEqual({ kind: 'ok', msg: 'Replaced "Pirate".' });
  });

  it('refuses a damaged language and a newer file before any confirm', async () => {
    for (const bad of [languageFile({ language: { id: 'x' } }), languageFile({ v: 2 })]) {
      const status = await importBundleFile(fileOf(bad), 'language');
      expect(status?.kind).toBe('err');
    }
    expect(confirmDialog).not.toHaveBeenCalled();
  });

  it('says so when the custom language limit is reached', async () => {
    seed(
      Array.from({ length: CUSTOM_LANGUAGES_MAX }, (_, i) => ({
        id: `bulk-${i}`,
        label: `Bulk ${i}`,
        hint: 'h',
        examples: [],
        createdAt: 1,
      })),
    );
    const status = await importBundleFile(fileOf(languageFile()), 'language');
    expect(status?.kind).toBe('err');
    expect(status?.msg).toMatch(new RegExp(`limit is ${CUSTOM_LANGUAGES_MAX}`));
    expect(await getCustomLanguages()).toHaveLength(CUSTOM_LANGUAGES_MAX);
  });
});
