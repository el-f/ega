import { describe, it, expect } from 'vitest';
import { getSettings } from '@/shared/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { preset } from '@tests/_helpers/lang';

const CUSTOM_ID = '3f1c1a2e-5b7d-4c8a-9e6f-0a1b2c3d4e5f';
const ORIGIN = 'https://example.test';

async function seed(lastDirection: { source: string; target: string }): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.customLanguages]: [
      { id: CUSTOM_ID, label: 'Mine', hint: '', examples: [], createdAt: 1 },
    ],
    [STORAGE_KEYS.settings]: {
      ...DEFAULT_SETTINGS,
      sitePrefs: { [ORIGIN]: { disabled: false, lastDirection } },
    },
  });
}

describe('sitePrefs.lastDirection — custom variety ids', () => {
  it('keeps a direction memo that targets a 36-char custom variety id', async () => {
    await seed({ source: 'auto', target: CUSTOM_ID });

    const s = await getSettings();

    expect(s.sitePrefs[ORIGIN]?.lastDirection).toEqual({
      source: 'auto',
      target: preset(CUSTOM_ID),
    });
  });

  it('still drops a direction memo pointing at an id no variety owns', async () => {
    await seed({ source: 'auto', target: 'e7d0b1a4-0000-4000-8000-000000000000' });

    const s = await getSettings();

    expect(s.sitePrefs[ORIGIN]?.lastDirection).toBeUndefined();
  });
});
