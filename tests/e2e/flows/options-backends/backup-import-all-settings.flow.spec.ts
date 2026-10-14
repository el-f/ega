/* coverage: options.backends.backup-import-all-settings */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Import all-settings JSON overwrites settings and shows Imported status', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="data"]').click();
  timeline.markStep('data-tab-open');

  // parseSettingsBundle needs version 1, settings and customLanguages; missing settings fields take their defaults.
  const importPayload = JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { anthropicApiKey: 'sk-ant-imported' },
    customLanguages: [],
  });

  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5_000 });
  await page.getByText('Import settings...', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'ega-settings-test.json',
    mimeType: 'application/json',
    buffer: Buffer.from(importPayload),
  });
  timeline.markStep('file-chosen');

  // First dialog: "Import settings?" names the file — hit Import
  const importDialog = page.locator('.ega-dialog', { hasText: 'Import settings?' });
  await expect(importDialog).toBeVisible({ timeout: 5_000 });
  await expect(importDialog).toContainText('ega-settings-test.json');
  await importDialog.getByRole('button', { name: 'Import', exact: true }).click();

  // Second dialog: "Use the API keys in this file?" — use them
  const keysDialog = page.locator('.ega-dialog', { hasText: 'Use the API keys in this file?' });
  await expect(keysDialog).toBeVisible({ timeout: 5_000 });
  await keysDialog.getByRole('button', { name: "Use the file's keys", exact: true }).click();
  timeline.markStep('import-confirmed');

  await expect(page.locator('[role="status"]', { hasText: 'Imported' })).toBeVisible({
    timeout: 8_000,
  });

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.anthropicApiKey;
      },
      { timeout: 10_000 },
    )
    .toBe('sk-ant-imported');
});
