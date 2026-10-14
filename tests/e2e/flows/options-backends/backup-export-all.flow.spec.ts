/* coverage: options.backends.backup-export-all */
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

test.slow();

test('Advanced→Data Export all-settings triggers a download and shows Exported status', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="data"]').click();
  timeline.markStep('data-tab-open');

  const downloadPromise = page.waitForEvent('download', { timeout: 8_000 });
  await page.locator('[data-ega-export-all]').click();
  timeline.markStep('export-clicked');

  const dl = await downloadPromise;
  expect(dl.suggestedFilename()).toMatch(/^ega-settings-.+\.json$/);

  const status = page.locator('[role="status"]', {
    hasText: 'Exported all settings without API keys',
  });
  await expect(status).toBeVisible({ timeout: 5_000 });
  // Stripping the keys guards the billing account only — the status must say what is still in the file.
  await expect(status).toContainText(/glossary/i);
  await expect(status).toContainText(/site-override host list/i);
});
