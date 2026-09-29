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

test('Advanced sub-tab navigation persists via sessionStorage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-advanced').click();
  await expect(page.locator('[data-ega-subtab="diagnostics"]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('advanced-open');

  // Default pane is Diagnostics — its content should be visible.
  await expect(page.locator('#adv-pane-diagnostics')).toBeVisible({ timeout: 5_000 });

  // Click the Data sub-tab.
  await page.locator('[data-ega-subtab="data"]').click();
  await expect(page.locator('#adv-pane-data')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#adv-pane-diagnostics')).not.toBeVisible();
  timeline.markStep('data-pane-visible');

  // sessionStorage must have recorded the active sub-tab.
  const storedAfterData = await page.evaluate(() => sessionStorage.getItem('ega-advanced-subtab'));
  expect(storedAfterData).toBe('data');

  // Click the Labs sub-tab.
  await page.locator('[data-ega-subtab="labs"]').click();
  await expect(page.locator('#adv-pane-labs')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#adv-pane-data')).not.toBeVisible();
  timeline.markStep('labs-pane-visible');

  const storedAfterLabs = await page.evaluate(() => sessionStorage.getItem('ega-advanced-subtab'));
  expect(storedAfterLabs).toBe('labs');

  // Simulate re-mount: reload the options page — sessionStorage key must
  // restore the Labs sub-tab without another click.
  await page.reload();
  await page.locator('#tab-advanced').click();
  await expect(page.locator('#adv-pane-labs')).toBeVisible({ timeout: 8_000 });
  timeline.markStep('persisted-after-reload');
  timeline.report();
});
