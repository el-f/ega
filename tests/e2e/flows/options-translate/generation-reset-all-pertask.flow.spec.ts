/* coverage: options.translate.generation-reset-all-pertask */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  // Seed overrides for two tasks.
  await seedSettings(ext.context, ext.extensionId, {
    taskTemperatures: { translate: 0.5, reword: 0.7 },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('SectionReset on per-task card clears all task temperature overrides', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-translate').click();

  // Per-task overrides card.
  await expect(page.locator('[data-ega-per-task-overrides-card]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('per-task-card-visible');

  // SectionReset visible because perTaskModifiedCount > 0.
  const sectionReset = page
    .locator('[data-ega-per-task-overrides-card]')
    .locator('[data-ega-section-reset]');
  await expect(sectionReset).toBeVisible({ timeout: 3_000 });
  timeline.markStep('section-reset-visible');

  // Click Reset section.
  await sectionReset.click();
  timeline.markStep('section-reset-clicked');

  // Both overrides cleared from storage.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const tt = s?.taskTemperatures ?? {};
        return Object.keys(tt).length;
      },
      { timeout: 5_000 },
    )
    .toBe(0);

  // SectionReset hidden once all overrides gone.
  await expect(sectionReset).toHaveCount(0);
  timeline.markStep('section-reset-hidden');
  timeline.report();
});
