import { test, expect, type BrowserContext } from '@playwright/test';
import { seedSettings } from './helpers';

// The schema check runs before seedSettings touches the browser, so no extension is launched here.
const noBrowser = {} as BrowserContext;

test('seedSettings rejects a top-level key the settings schema does not have', async () => {
  await expect(seedSettings(noBrowser, 'unused', { backend: 'anthropic' })).rejects.toThrow(
    /"backend"/,
  );
});

test('seedSettings rejects an unknown key inside a nested settings record', async () => {
  await expect(
    seedSettings(noBrowser, 'unused', { sitePrefs: { 'a.com': { targetLang: 'es' } } }),
  ).rejects.toThrow(/sitePrefs\.a\.com\.targetLang/);
});
