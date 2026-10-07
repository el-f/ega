/* coverage: options.backends.backup-export-with-keys-confirm */
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

test('Export with include-keys checked + type EXPORT KEYS fires download with keys-included message', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="data"]').click();
  timeline.markStep('data-tab-open');

  await page.locator('#adv-include-keys').check();
  await expect(page.locator('#adv-include-keys')).toBeChecked();

  await page.locator('[data-ega-export-all]').click();
  timeline.markStep('export-clicked');

  const dialog = page.locator('.ega-dialog', { hasText: 'Export with API keys' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  const confirmBtn = dialog.getByRole('button', { name: 'Export with keys', exact: true });
  await expect(confirmBtn).toBeDisabled();

  await dialog.locator('#confirm-input').fill('EXPORT KEYS');
  await expect(confirmBtn).toBeEnabled({ timeout: 2_000 });

  const downloadPromise = page.waitForEvent('download', { timeout: 8_000 });
  await confirmBtn.click();
  timeline.markStep('confirmed');

  const dl = await downloadPromise;
  expect(dl.suggestedFilename()).toMatch(/^ega-settings-.+\.json$/);

  await expect(
    page.locator('[role="status"]', { hasText: 'Exported all settings with API keys' }),
  ).toBeVisible({ timeout: 5_000 });
});
