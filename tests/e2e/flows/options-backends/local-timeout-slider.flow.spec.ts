/* coverage: options.backends.local-timeout-slider */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    localBackendTimeoutMs: 800,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('local-backend timeout slider persists localBackendTimeoutMs to storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-backends').click();

  const section = page.locator('[data-ega-setting="backends.localBackendTimeoutMs"]');
  await expect(section).toBeVisible({ timeout: 5_000 });
  timeline.markStep('section-visible');

  const thumb = section.locator('[role="slider"]');
  await expect(thumb).toBeVisible({ timeout: 3_000 });
  await thumb.focus();

  // The slider shows seconds; each ArrowRight step is 0.1 s. Press 4× → 0.8 s + 0.4 s = 1200 ms.
  // The write lands on release (each press is a down and an up), so storage follows the last step.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowRight');
  }
  timeline.markStep('slider-advanced');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.localBackendTimeoutMs;
      },
      { timeout: 5_000 },
    )
    .toBeGreaterThan(800);

  timeline.markStep('storage-updated');
  timeline.report();
});
