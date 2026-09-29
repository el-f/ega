/* coverage: options.about.delete-all-data-cancel */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, readStorage, type ExtensionHandle } from '../../helpers';
import { assertStaysStable, createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'sk-ant-canary' });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Delete all data with wrong confirm text keeps button disabled and leaves storage untouched', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-about').click();
  timeline.markStep('about-active');

  await page.getByRole('button', { name: 'Delete all data' }).click();

  const dialog = page.locator('.ega-dialog', { hasText: 'Delete all data' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  const confirmBtn = dialog.getByRole('button', { name: 'Delete all data', exact: true });
  await expect(confirmBtn).toBeDisabled();

  await dialog.locator('#confirm-input').fill('delete');
  await expect(confirmBtn).toBeDisabled({ timeout: 1_000 });

  await dialog.locator('#confirm-input').fill('');
  await expect(confirmBtn).toBeDisabled({ timeout: 1_000 });

  // Dismiss via Cancel.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  timeline.markStep('cancelled');

  await assertStaysStable(
    async () => {
      const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
      return s?.anthropicApiKey;
    },
    'sk-ant-canary',
    { windowMs: 1_500 },
  );
});
