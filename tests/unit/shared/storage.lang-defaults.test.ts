import { describe, it, expect } from 'vitest';
import { getSettings } from '@/shared/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

async function seed(patch: Record<string, unknown>): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, ...patch },
  });
}

describe('language defaults — repairing old rows', () => {
  it('drops a stored defaultTargetLang of "auto" back to the shipped default', async () => {
    await seed({ defaultTargetLang: 'auto' });

    const s = await getSettings();

    expect(s.defaultTargetLang).toBe(DEFAULT_SETTINGS.defaultTargetLang);
    expect(s.defaultTargetLang).not.toBe('auto');
  });

  it('keeps a stored defaultLang of "auto" — the source side may detect', async () => {
    await seed({ defaultLang: 'auto' });

    const s = await getSettings();

    expect(s.defaultLang).toBe('auto');
  });

  it('keeps a real stored defaultTargetLang', async () => {
    await seed({ defaultTargetLang: 'fr' });

    const s = await getSettings();

    expect(s.defaultTargetLang).toBe('fr');
  });
});
