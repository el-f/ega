/* coverage: options.display.confidence-pill-toggle */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    defaultDisplayMode: 'tooltip',
    confidencePill: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('confidence pill toggle shows/hides threshold slider and persists setting', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-translate').click();

  await expect(page.locator('[data-ega-knobs="tooltip"]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('tooltip-knobs-visible');

  const pillCheckbox = page.locator(
    '[data-ega-setting="display.confidencePill"] input[type="checkbox"]',
  );
  const thresholdSlider = page.locator('[data-ega-setting="display.confidencePillThreshold"]');

  await expect(pillCheckbox).toBeChecked();
  await expect(thresholdSlider).toBeVisible();
  timeline.markStep('slider-visible-when-enabled');

  await pillCheckbox.click();
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.confidencePill;
      },
      { timeout: 5_000 },
    )
    .toBe(false);

  await expect(thresholdSlider).not.toBeVisible({ timeout: 3_000 });
  timeline.markStep('slider-hidden-when-disabled');

  await pillCheckbox.click();
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.confidencePill;
      },
      { timeout: 5_000 },
    )
    .toBe(true);

  await expect(thresholdSlider).toBeVisible({ timeout: 3_000 });
  timeline.markStep('slider-visible-re-enabled');
  timeline.report();
});
