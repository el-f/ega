/* coverage: options.backends.reset-all-advanced-to-defaults */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, readStorage, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    sitePrefs: { 'reset-flow.example.com': { disabled: true } },
    advanced: { temperature: 0.9, maxTokens: 500 },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Reset to defaults clears sitePrefs and shows the Defaults restored toast', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="data"]').click();
  timeline.markStep('data-tab-open');

  await page.locator('[data-ega-reset-defaults]').click();

  const dialog = page.locator('.ega-dialog', { hasText: 'Reset prompt and generation settings' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  const confirmBtn = dialog.getByRole('button', { name: 'Reset', exact: true });
  await expect(confirmBtn).toBeDisabled();

  await dialog.locator('#confirm-input').fill('RESET');
  await expect(confirmBtn).toBeEnabled({ timeout: 2_000 });
  await confirmBtn.click();
  timeline.markStep('confirmed');

  // Toast "Defaults restored" should appear.
  await expect(page.getByText('Defaults restored')).toBeVisible({ timeout: 8_000 });

  // sitePrefs should be empty.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return Object.keys(s?.sitePrefs ?? {}).length;
      },
      { timeout: 10_000 },
    )
    .toBe(0);
});
