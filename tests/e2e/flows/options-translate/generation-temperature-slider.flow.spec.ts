/* coverage: options.translate.generation-temperature-slider */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  // Start at default temperature (0.2) so ResetField is absent.
  await seedSettings(ext.context, ext.extensionId, {
    advanced: { temperature: 0.2, maxTokens: 2048 },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('temperature slider persists value and ResetField reverts to default', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-translate').click();

  // GenerationSection must be visible.
  await expect(page.locator('[data-ega-generation-card]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('generation-card-visible');

  // ResetField absent when value == default.
  const resetField = page.locator(
    '[data-ega-setting="advanced.temperature"] [data-ega-reset-field]',
  );
  await expect(resetField).toHaveCount(0);

  // Focus the bits-ui slider thumb (role=slider, aria-labelledby points to "Temperature" label).
  const thumb = page.locator('[data-ega-setting="advanced.temperature"] [role="slider"]');
  await expect(thumb).toBeVisible({ timeout: 3_000 });
  await thumb.focus();

  // Press ArrowRight 4× to advance by 4 steps of 0.05 = +0.20, landing at 0.40.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowRight');
  }
  timeline.markStep('slider-advanced');

  // Storage update is asynchronous — wait for it.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.temperature;
      },
      { timeout: 5_000 },
    )
    .toBeGreaterThan(0.2);

  // ResetField should now be visible.
  await expect(resetField).toBeVisible({ timeout: 3_000 });
  timeline.markStep('reset-field-visible');

  // Click ResetField — reverts to default 0.2.
  await resetField.click();

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.temperature;
      },
      { timeout: 5_000 },
    )
    .toBe(0.2);

  // ResetField gone again.
  await expect(resetField).toHaveCount(0);
  timeline.markStep('reverted-to-default');
  timeline.report();
});
