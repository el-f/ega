/* coverage: options.advanced.labs-probe-ttl-slider */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('Backend probe TTL slider persists advanced.backendProbeTtlMs', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="labs"]').click();
  await expect(page.locator('#adv-pane-labs')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('labs-open');

  // The probe-TTL slider is inside the [data-ega-setting="advanced.backendProbeTtlMs"] wrapper.
  const sliderContainer = page.locator('[data-ega-setting="advanced.backendProbeTtlMs"]');
  await expect(sliderContainer).toBeVisible({ timeout: 5_000 });

  // The bits-ui slider thumb has role="slider".
  const thumb = sliderContainer.locator('[role="slider"]');
  await expect(thumb).toBeVisible({ timeout: 3_000 });
  await thumb.focus();

  // Default is 30 s (30_000 ms). Step = 5 s. Press ArrowRight 2× → 40 s.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  timeline.markStep('slider-advanced');

  // Storage must update: 30_000 ms → 40_000 ms.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.backendProbeTtlMs;
      },
      { timeout: 8_000 },
    )
    .toBe(40_000);

  // Modified dot should be visible (slider renders it when value != default).
  await expect(sliderContainer.locator('[data-ega-modified="true"]')).toBeVisible({
    timeout: 3_000,
  });
  timeline.markStep('storage-updated');
  timeline.report();
});
