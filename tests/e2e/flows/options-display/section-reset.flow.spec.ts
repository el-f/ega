/* coverage: options.display.section-reset */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    defaultDisplayMode: 'tooltip',
    tooltipShowSource: false,
    tooltipClickOutside: true,
    tooltipDraggable: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('SectionReset appears after modifying a knob and reverts to defaults on click', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-translate').click();

  await expect(page.locator('[data-ega-knobs="tooltip"]')).toBeVisible({ timeout: 5_000 });

  const resetBtn = page.locator('[data-ega-section-reset]');
  await expect(resetBtn).toHaveCount(0);
  timeline.markStep('no-reset-before-modify');

  const showSourceCheckbox = page.locator(
    '[data-ega-setting="display.tooltipShowSource"] input[type="checkbox"]',
  );
  await showSourceCheckbox.click();

  await expect(resetBtn).toBeVisible({ timeout: 3_000 });
  timeline.markStep('reset-visible-after-modify');

  await resetBtn.click();

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.tooltipShowSource;
      },
      { timeout: 5_000 },
    )
    .toBe(false);

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.tooltipClickOutside;
      },
      { timeout: 5_000 },
    )
    .toBe(true);

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.tooltipDraggable;
      },
      { timeout: 5_000 },
    )
    .toBe(false);

  await expect(resetBtn).toHaveCount(0);
  timeline.markStep('reset-hidden-after-revert');
  timeline.report();
});
