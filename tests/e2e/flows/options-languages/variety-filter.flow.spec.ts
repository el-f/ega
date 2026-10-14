/* coverage: options.languages.variety-filter */
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

test('Filter languages input narrows the list; clearing restores the full list', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-languages').click();
  timeline.markStep('tab-open');

  // Count total visible variety rows before filtering.
  const rowLocator = page.locator('.variety-row');
  await expect(rowLocator.first()).toBeVisible({ timeout: 5_000 });
  const totalCount = await rowLocator.count();
  expect(totalCount).toBeGreaterThan(1);
  timeline.markStep('list-loaded');

  // Type a query that should match only "Arabizi".
  const filterInput = page.locator('[data-ega-variety-filter] input');
  await filterInput.fill('Arabizi');
  timeline.markStep('filtered');

  // List must narrow to exactly 1 row.
  await expect.poll(() => rowLocator.count(), { timeout: 5_000 }).toBe(1);

  await expect(page.locator('.variety-row').first()).toContainText('Arabizi');

  // Clear the filter — full list must restore.
  await filterInput.fill('');
  timeline.markStep('cleared');

  await expect.poll(() => rowLocator.count(), { timeout: 5_000 }).toBe(totalCount);
});
