/* coverage: options.translate.generation-per-task-override */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  // No per-task overrides set.
  await seedSettings(ext.context, ext.extensionId, {
    taskTemperatures: {},
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('per-task temperature input for Translate persists; ResetField clears it', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-translate').click();

  // Per-task overrides grid must be visible.
  await expect(page.locator('[data-ega-per-task-overrides-card]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('per-task-card-visible');

  // Temperature input for the "translate" task row.
  const tempInput = page.locator('[data-ega-pertask-temp="translate"]');
  await expect(tempInput).toBeVisible({ timeout: 3_000 });

  // ResetField absent when no override.
  const resetField = page.locator(
    '[data-ega-pertask-row="translate"] [data-ega-reset-field][aria-label*="temperature"]',
  );
  await expect(resetField).toHaveCount(0);

  // Enter a value.
  await tempInput.fill('0.8');
  await tempInput.press('Tab');
  await tempInput.dispatchEvent('input');
  timeline.markStep('value-entered');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.taskTemperatures?.['translate'];
      },
      { timeout: 5_000 },
    )
    .toBeCloseTo(0.8, 2);

  // ResetField appears.
  await expect(resetField).toBeVisible({ timeout: 3_000 });
  timeline.markStep('reset-field-visible');

  // Click ResetField — clears the override.
  await resetField.click();

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const tt = s?.taskTemperatures ?? {};
        return Object.prototype.hasOwnProperty.call(tt, 'translate');
      },
      { timeout: 5_000 },
    )
    .toBe(false);

  await expect(resetField).toHaveCount(0);
  timeline.markStep('override-cleared');
  timeline.report();
});
