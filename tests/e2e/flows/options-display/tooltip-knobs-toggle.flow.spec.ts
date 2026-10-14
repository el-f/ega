/* coverage: options.display.tooltip-knobs-toggle */
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

test('tooltip knob checkboxes persist each setting independently', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-translate').click();

  await expect(page.locator('[data-ega-knobs="tooltip"]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('tooltip-knobs-visible');

  const showSourceCheckbox = page.locator(
    '[data-ega-setting="display.tooltipShowSource"] input[type="checkbox"]',
  );
  const clickOutsideCheckbox = page.locator(
    '[data-ega-setting="display.tooltipClickOutside"] input[type="checkbox"]',
  );
  const draggableCheckbox = page.locator(
    '[data-ega-setting="display.tooltipDraggable"] input[type="checkbox"]',
  );

  await expect(showSourceCheckbox).not.toBeChecked();
  await expect(clickOutsideCheckbox).toBeChecked();
  await expect(draggableCheckbox).not.toBeChecked();

  await showSourceCheckbox.click();
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.tooltipShowSource;
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  timeline.markStep('show-source-persisted');

  await clickOutsideCheckbox.click();
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.tooltipClickOutside;
      },
      { timeout: 5_000 },
    )
    .toBe(false);
  timeline.markStep('click-outside-persisted');

  await draggableCheckbox.click();
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.tooltipDraggable;
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  timeline.markStep('draggable-persisted');
  timeline.report();
});
