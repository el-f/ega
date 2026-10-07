/* coverage: options.advanced.delete-all-data-cancel */
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

test('Delete all data with the wrong word does nothing, and Keep my data leaves storage untouched', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="data"]').click();
  timeline.markStep('data-active');

  await page.locator('[data-ega-delete-all]').click();

  const dialog = page.locator('.ega-dialog', { hasText: 'Delete all data?' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  const field = dialog.locator('[data-ega-delete-all-field]');
  await expect(field).toBeFocused();

  // The red button keeps its Tab stop and names its reason, but does nothing yet.
  const confirmBtn = page.locator('[data-ega-delete-all-confirm]');
  await expect(confirmBtn).toHaveAttribute('aria-disabled', 'true');
  await expect(confirmBtn).toHaveAccessibleDescription('Type DELETE to confirm');

  await field.fill('delete');
  await expect(confirmBtn).toHaveAttribute('aria-disabled', 'true');
  await field.press('Enter');
  await confirmBtn.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();

  await page.getByRole('button', { name: 'Keep my data' }).click();
  await expect(dialog).toBeHidden({ timeout: 5_000 });
  timeline.markStep('kept');

  await assertStaysStable(
    async () => {
      const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
      return s?.anthropicApiKey;
    },
    'sk-ant-canary',
    { windowMs: 1_500 },
  );
});
