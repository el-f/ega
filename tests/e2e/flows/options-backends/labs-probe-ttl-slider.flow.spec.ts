/* coverage: options.backends.labs-probe-ttl-slider */
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

test('"Remember backend status for" on the Backends tab persists advanced.backendProbeTtlMs', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-backends').click();
  await expect(page.getByRole('heading', { name: 'Timeouts and checks' })).toBeVisible({
    timeout: 5_000,
  });
  // Labs is gone; the slider carries an "Experimental" pill instead of a paragraph.
  await expect(page.locator('#tab-advanced')).toBeVisible();
  timeline.markStep('checks-card-visible');

  // The probe-TTL slider is inside the [data-ega-setting="advanced.backendProbeTtlMs"] wrapper.
  const sliderContainer = page.locator('[data-ega-setting="advanced.backendProbeTtlMs"]');
  await expect(sliderContainer).toBeVisible({ timeout: 5_000 });

  // The bits-ui slider thumb has role="slider".
  const thumb = sliderContainer.locator('[role="slider"]');
  await expect(thumb).toBeVisible({ timeout: 3_000 });
  await thumb.focus();

  await expect(sliderContainer).toContainText('Experimental');
  // Default is 30 s (30_000 ms). Step = 5 s. Press ArrowRight 2× → 40 s; the write lands on release.
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

  // The word "Changed" shows once the value differs from the default.
  await expect(sliderContainer.locator('[data-ega-modified="true"]')).toBeVisible({
    timeout: 3_000,
  });
  timeline.markStep('storage-updated');
  timeline.report();
});
