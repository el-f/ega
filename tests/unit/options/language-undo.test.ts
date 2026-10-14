import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMock } from '@tests/mocks/chrome';
import {
  getCustomLanguages,
  getSettings,
  updateSettings,
  upsertCustomLanguage,
} from '@/shared/storage';
import { DEFAULT_CONTEXT_MENU_ITEMS } from '@/shared/context-menu';
import { asLangPresetIdUnsafe } from '@/shared/brands';
import { deleteLanguage, restoreLanguage } from '@/options/language-undo';
import type { CustomLanguage, Settings } from '@/shared/types';

const lang = (id: string, label: string, createdAt: number): CustomLanguage => ({
  id: asLangPresetIdUnsafe(id),
  label,
  hint: `${label} notes`,
  examples: [{ src: 'yo', tgt: 'hi' }],
  createdAt,
});

const MINE = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const THIRD = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  resetChromeMock();
});

/** Settings that name the language everywhere a language can be named. */
async function seedEverywhere(): Promise<Settings> {
  await upsertCustomLanguage(lang(OTHER, 'Other', 1));
  await upsertCustomLanguage(lang(MINE, 'Mine', 2));
  await upsertCustomLanguage(lang(THIRD, 'Third', 3));
  const cur = await getSettings();
  return updateSettings({
    defaultLang: MINE,
    defaultTargetLang: MINE,
    disabledVarieties: ['arabizi', MINE],
    advanced: {
      ...cur.advanced,
      perPresetTemplates: { [MINE]: { system: 'Mine system', user: 'Mine {{text}}' } },
    },
    glossary: [
      { term: 'a', translation: 'b', caseSensitive: false },
      { term: 'c', translation: 'd', caseSensitive: false, sourceLang: MINE },
      { term: 'e', translation: 'f', caseSensitive: true, targetLang: MINE },
    ],
    contextMenuItems: [
      ...DEFAULT_CONTEXT_MENU_ITEMS,
      {
        id: 'ega-mine-item',
        kind: 'task',
        enabled: true,
        order: 99,
        label: '',
        task: 'translate',
        surface: 'tooltip',
        targetLang: MINE,
      },
    ],
    sitePrefs: {
      'https://a.example': { disabled: false, defaultLang: MINE },
      'https://b.example': { disabled: true, lastDirection: { source: MINE, target: 'en' } },
    },
  } as unknown as Partial<Settings>);
}

describe('custom language delete with Undo', () => {
  it('Undo leaves the settings and the language list deep-equal to before', async () => {
    await seedEverywhere();
    const beforeSettings = await getSettings();
    const beforeRows = await getCustomLanguages();
    // The seed must name the language in every place, or this proves nothing.
    expect(beforeSettings.defaultLang).toBe(MINE);
    expect(beforeSettings.glossary).toHaveLength(3);
    expect(beforeSettings.sitePrefs['https://a.example']?.defaultLang).toBe(MINE);

    const deleted = await deleteLanguage(MINE);
    expect(deleted).not.toBeNull();
    const after = await getSettings();
    expect((await getCustomLanguages()).map((c) => c.id)).toEqual([OTHER, THIRD]);
    expect(after.advanced.perPresetTemplates[MINE]).toBeUndefined();
    expect(after.defaultLang).not.toBe(MINE);
    expect(after.glossary).toHaveLength(1);

    await restoreLanguage(deleted as NonNullable<typeof deleted>);
    expect(await getCustomLanguages()).toEqual(beforeRows);
    expect(await getSettings()).toEqual(beforeSettings);
  });

  it('keeps a change made between the delete and the Undo', async () => {
    await seedEverywhere();
    const deleted = await deleteLanguage(MINE);
    await updateSettings({ glossary: [{ term: 'new', translation: 'n', caseSensitive: false }] });
    const restored = await restoreLanguage(deleted as NonNullable<typeof deleted>);
    expect(restored.glossary.map((g) => g.term)).toEqual(['new', 'c', 'e']);
  });

  it('a language already gone gives nothing to undo', async () => {
    expect(await deleteLanguage(MINE)).toBeNull();
  });
});
