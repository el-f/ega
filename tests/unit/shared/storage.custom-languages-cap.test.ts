import { describe, it, expect } from 'vitest';
import { getCustomLanguages, upsertCustomLanguage } from '@/shared/storage';
import { CUSTOM_LANGUAGES_MAX } from '@/shared/storage/sanitise';
import { importAs } from '@tests/_helpers/import-bundle';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { CUSTOM_LANG_EXAMPLES_MAX, VARIETY_HINT_MAX } from '@/shared/settings-schema';
import { preset } from '@tests/_helpers/lang';
import type { CustomLanguage } from '@/shared/types';

function lang(i: number): CustomLanguage {
  return {
    id: preset(`c${i}`),
    label: `lang ${i}`,
    hint: 'hint',
    examples: [],
    createdAt: i,
  };
}

async function seedStored(count: number): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.customLanguages]: Array.from({ length: count }, (_, i) => lang(i)),
  });
}

describe('custom-language cap', () => {
  it('trims an oversized stored list on read', async () => {
    await seedStored(CUSTOM_LANGUAGES_MAX + 10);
    expect(await getCustomLanguages()).toHaveLength(CUSTOM_LANGUAGES_MAX);
  });

  it('refuses a new entry once the list is full', async () => {
    await seedStored(CUSTOM_LANGUAGES_MAX);
    await expect(upsertCustomLanguage(lang(9999))).rejects.toThrow('cap-reached');
    expect(await getCustomLanguages()).toHaveLength(CUSTOM_LANGUAGES_MAX);
  });

  it('still updates an existing entry when the list is full', async () => {
    await seedStored(CUSTOM_LANGUAGES_MAX);
    await upsertCustomLanguage({ ...lang(0), label: 'renamed' });
    const list = await getCustomLanguages();
    expect(list).toHaveLength(CUSTOM_LANGUAGES_MAX);
    expect(list.find((l) => l.id === preset('c0'))?.label).toBe('renamed');
  });

  it('caps the list an import brings in', async () => {
    await importAs(
      {
        version: 1,
        settings: { ...DEFAULT_SETTINGS },
        customLanguages: Array.from({ length: CUSTOM_LANGUAGES_MAX + 25 }, (_, i) => lang(i)),
      },
      'settings',
    );
    expect(await getCustomLanguages()).toHaveLength(CUSTOM_LANGUAGES_MAX);
  });
});

describe('custom-language writer validation', () => {
  it('clamps an over-long hint instead of storing a row the reader must repair', async () => {
    await upsertCustomLanguage({ ...lang(1), hint: 'h'.repeat(VARIETY_HINT_MAX + 40) });
    const list = await getCustomLanguages();
    expect(list[0]?.hint).toHaveLength(VARIETY_HINT_MAX);
  });

  it('slices the examples list to the stored cap', async () => {
    await upsertCustomLanguage({
      ...lang(2),
      examples: Array.from({ length: CUSTOM_LANG_EXAMPLES_MAX + 5 }, () => ({
        src: 's',
        tgt: 't',
      })),
    });
    const list = await getCustomLanguages();
    expect(list[0]?.examples).toHaveLength(CUSTOM_LANG_EXAMPLES_MAX);
  });

  it('rejects a row no clamp can fix rather than writing it', async () => {
    const broken = { ...lang(3), label: '' };
    await expect(upsertCustomLanguage(broken)).rejects.toThrow('invalid-language');
    expect(await getCustomLanguages()).toHaveLength(0);
  });
});
