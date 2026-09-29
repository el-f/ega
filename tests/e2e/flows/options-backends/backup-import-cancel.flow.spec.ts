/* coverage: options.backends.backup-import-cancel */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, readStorage, type ExtensionHandle } from '../../helpers';
import { assertStaysStable, createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'sk-ant-original' });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Canceling import confirm leaves settings unchanged and shows no status', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="data"]').click();
  timeline.markStep('data-tab-open');

  // A real backup: the file is schema-checked before any dialog opens, so an invented
  // shape is refused outright and never reaches the confirm this test is about.
  const importPayload = JSON.stringify({
    version: 1,
    settings: { anthropicApiKey: 'sk-ant-new' },
    customLanguages: [],
  });

  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5_000 });
  await page.locator('label[for="adv-import"]').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'ega-settings-cancel-test.json',
    mimeType: 'application/json',
    buffer: Buffer.from(importPayload),
  });
  timeline.markStep('file-chosen');

  const importDialog = page.locator('.ega-dialog', { hasText: 'Import settings' });
  await expect(importDialog).toBeVisible({ timeout: 5_000 });
  await importDialog.getByRole('button', { name: 'Cancel' }).click();
  timeline.markStep('cancelled');

  // backup-status element only mounts when status !== null — div.backup-status
  // should not be present after a canceled import.
  await expect(page.locator('.backup-status')).not.toBeVisible({ timeout: 2_000 });

  await assertStaysStable(
    async () => {
      const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
      return s?.anthropicApiKey;
    },
    'sk-ant-original',
    { windowMs: 1_500 },
  );
});
