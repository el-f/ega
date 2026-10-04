/* coverage: options.translate.cache-disable */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { cacheEnabled: true });
});

test.afterEach(async () => {
  await ext.close();
});

test('cache checkbox toggle persists cacheEnabled in both directions', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-translate').click();

  // CacheSection renders the checkbox.
  const cacheCheckbox = page.locator('[data-ega-cache-card] input[type="checkbox"]');
  await expect(cacheCheckbox).toBeVisible({ timeout: 5_000 });
  await expect(cacheCheckbox).toBeChecked();
  timeline.markStep('cache-checkbox-checked');

  // Uncheck.
  await cacheCheckbox.click();

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.cacheEnabled;
      },
      { timeout: 5_000 },
    )
    .toBe(false);

  await expect(cacheCheckbox).not.toBeChecked();
  timeline.markStep('cache-disabled');

  // Re-check.
  await cacheCheckbox.click();

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.cacheEnabled;
      },
      { timeout: 5_000 },
    )
    .toBe(true);

  await expect(cacheCheckbox).toBeChecked();
  timeline.markStep('cache-re-enabled');
  timeline.report();
});
