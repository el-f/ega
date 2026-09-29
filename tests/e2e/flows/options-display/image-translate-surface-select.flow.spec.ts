/* coverage: options.display.image-translate-surface-select */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { imageTranslateSurface: 'sidepanel' });
});

test.afterEach(async () => {
  await ext.close();
});

test('changing image translation surface persists imageTranslateSurface', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-translate').click();
  timeline.markStep('display-tab-open');

  const select = page
    .locator('[data-ega-setting="display.imageTranslateSurface"]')
    .getByLabel('Image translation opens in');
  await expect(select).toBeVisible({ timeout: 5_000 });
  await expect(select).toHaveValue('sidepanel');

  await select.selectOption('tooltip');
  timeline.markStep('option-selected');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.imageTranslateSurface;
      },
      { timeout: 5_000 },
    )
    .toBe('tooltip');

  await select.selectOption('sidepanel');
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.imageTranslateSurface;
      },
      { timeout: 5_000 },
    )
    .toBe('sidepanel');
  timeline.markStep('round-trip-verified');
  timeline.report();
});
