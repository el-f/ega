/* coverage: options.advanced.subtab-navigation */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('Advanced opens on Data; the chosen sub-tab persists via sessionStorage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-advanced').click();
  await expect(page.locator('[data-ega-subtab="data"]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('advanced-open');

  // Data is the default: backup is the common job, Diagnostics is for debugging.
  await expect(page.locator('#adv-pane-data')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-ega-subtab="labs"]')).toHaveCount(0);

  await page.locator('[data-ega-subtab="diagnostics"]').click();
  await expect(page.locator('#adv-pane-diagnostics')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#adv-pane-data')).not.toBeVisible();
  timeline.markStep('diagnostics-pane-visible');

  const stored = await page.evaluate(() => sessionStorage.getItem('ega-advanced-subtab'));
  expect(stored).toBe('diagnostics');

  // A reload restores Diagnostics without another click.
  await page.reload();
  await page.locator('#tab-advanced').click();
  await expect(page.locator('#adv-pane-diagnostics')).toBeVisible({ timeout: 8_000 });
  timeline.markStep('persisted-after-reload');
  timeline.report();
});
