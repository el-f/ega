import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { getSettings } from '@/shared/storage';
import { exportGlossary } from '@/shared/storage/backup';
import { GLOSSARY_MAX, parseSettings } from '@/shared/settings-schema';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

import { importBundleFile } from '@/options/import-bundle';

function fileOf(content: unknown): File {
  return new File([JSON.stringify(content)], 'glossary.json', { type: 'application/json' });
}

const MINE = { term: 'Firebolt', translation: 'Saeta de Fuego', caseSensitive: false };

function seed(glossary: unknown[]): void {
  chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, parseSettings({ glossary }));
}

const glossaryFile = (entries: unknown[], v = 1) => ({
  egaGlossary: { v, exportedAt: '2026-10-02T00:00:00.000Z', entries },
});

describe('the glossary file', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.mocked(confirmDialog).mockClear();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('exports the glossary on its own', async () => {
    seed([MINE]);
    const bundle = await exportGlossary();
    expect(bundle.egaGlossary.v).toBe(1);
    expect(bundle.egaGlossary.entries).toEqual([MINE]);
  });

  it('adds new entries, keeps yours for a term you already have, and skips broken ones', async () => {
    seed([MINE]);
    const status = await importBundleFile(
      fileOf(
        glossaryFile([
          { ...MINE, translation: 'Rayo de Fuego' },
          { term: 'Nimbus', translation: 'Nimbo' },
          { term: 'Snitch', translation: 'Snitch', sourceLang: 'en', targetLang: 'es' },
          { term: '' },
          'not an entry',
          { term: 'Ghost', translation: 'x', sourceLang: '0d1e2f3a-4b5c-4d6e-8f70-819a2b3c4d5e' },
        ]),
      ),
      'glossary',
    );
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Add glossary entries?' }),
    );
    expect(status).toEqual({
      kind: 'ok',
      msg: 'Added 2 entries. Skipped 1 for a term you already have. Skipped 3 broken or unknown entries.',
    });
    expect((await getSettings()).glossary.map((e) => [e.term, e.translation])).toEqual([
      ['Firebolt', 'Saeta de Fuego'],
      ['Nimbus', 'Nimbo'],
      ['Snitch', 'Snitch'],
    ]);
  });

  it('counts a term as yours when either entry ignores case, since both would match the same text', async () => {
    seed([{ term: 'Apple', translation: 'Apple Inc.', caseSensitive: true }]);
    const status = await importBundleFile(
      fileOf(
        glossaryFile([
          { term: 'apple', translation: 'fruit' },
          { term: 'APPLE', translation: 'shout', caseSensitive: true },
        ]),
      ),
      'glossary',
    );
    expect(status?.msg).toBe('Added 1 entry. Skipped 1 for a term you already have.');
    expect((await getSettings()).glossary.map((e) => e.translation)).toEqual([
      'Apple Inc.',
      'shout',
    ]);
  });

  it('counts a term as yours when the scopes overlap, since one request could use both', async () => {
    seed([
      { term: 'Bank', translation: 'banco', sourceLang: 'en', caseSensitive: false },
      { term: 'Nimbus', translation: 'Nimbo', caseSensitive: false },
    ]);
    const status = await importBundleFile(
      fileOf(
        glossaryFile([
          { term: 'bank', translation: 'orilla' },
          { term: 'nimbus', translation: 'nube', sourceLang: 'en', targetLang: 'es' },
          { term: 'bank', translation: 'Bank', sourceLang: 'de' },
        ]),
      ),
      'glossary',
    );
    expect(status?.msg).toBe('Added 1 entry. Skipped 2 for a term you already have.');
    expect((await getSettings()).glossary.map((e) => [e.term, e.sourceLang])).toEqual([
      ['Bank', 'en'],
      ['Nimbus', undefined],
      ['bank', 'de'],
    ]);
  });

  it('keeps one term in two scopes from the same file, so an export imports back whole', async () => {
    seed([]);
    const status = await importBundleFile(
      fileOf(
        glossaryFile([
          { term: 'bank', translation: 'bank' },
          { term: 'bank', translation: 'orilla', sourceLang: 'en', targetLang: 'es' },
          { term: 'bank', translation: 'orilla', sourceLang: 'en', targetLang: 'es' },
        ]),
      ),
      'glossary',
    );
    expect(status?.msg).toBe('Added 2 entries. Skipped 1 for a term you already have.');
    expect((await getSettings()).glossary.map((e) => e.translation)).toEqual(['bank', 'orilla']);
  });

  it('matches a term in either Unicode form', async () => {
    seed([{ term: 'caf\u00e9', translation: 'coffee', caseSensitive: true }]);
    const status = await importBundleFile(
      fileOf(glossaryFile([{ term: 'cafe\u0301', translation: 'bar', caseSensitive: true }])),
      'glossary',
    );
    expect(status?.msg).toBe('Added 0 entries. Skipped 1 for a term you already have.');
  });

  it('keeps entries for custom languages while the custom list is unreadable', async () => {
    seed([]);
    chromeMock.storage.local._raw.set(STORAGE_KEYS.customLanguages, { broken: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const status = await importBundleFile(
      fileOf(
        glossaryFile([
          { term: 'Ghost', translation: 'x', sourceLang: '0d1e2f3a-4b5c-4d6e-8f70-819a2b3c4d5e' },
        ]),
      ),
      'glossary',
    );
    expect(status?.msg).toBe('Added 1 entry.');
  });

  it('stops at the glossary limit and says how many did not fit', async () => {
    seed(Array.from({ length: GLOSSARY_MAX - 1 }, (_, i) => ({ term: `t${i}`, translation: 'x' })));
    const status = await importBundleFile(
      fileOf(
        glossaryFile([
          { term: 'new1', translation: 'a' },
          { term: 'new2', translation: 'b' },
        ]),
      ),
      'glossary',
    );
    expect(status?.msg).toBe(`Added 1 entry. Skipped 1 over the ${GLOSSARY_MAX}-entry limit.`);
    expect((await getSettings()).glossary).toHaveLength(GLOSSARY_MAX);
  });

  it('canceling the confirm adds nothing', async () => {
    seed([MINE]);
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    const status = await importBundleFile(
      fileOf(glossaryFile([{ term: 'Nimbus', translation: 'Nimbo' }])),
      'glossary',
    );
    expect(status).toBeNull();
    expect((await getSettings()).glossary).toHaveLength(1);
  });

  it('refuses a file from a newer version before any confirm', async () => {
    const status = await importBundleFile(fileOf(glossaryFile([], 2)), 'glossary');
    expect(status?.kind).toBe('err');
    expect(status?.msg).toMatch(/from a newer Ega/);
    expect(confirmDialog).not.toHaveBeenCalled();
  });

  it('a languages file picked on the glossary row is refused', async () => {
    const status = await importBundleFile(
      fileOf({
        egaVarieties: { v: 1, customLanguages: [], varietyOverrides: {}, disabledVarieties: [] },
      }),
      'glossary',
    );
    expect(status?.kind).toBe('err');
    expect(status?.msg).toMatch(/languages export, not a glossary export/);
  });
});
