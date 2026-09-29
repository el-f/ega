import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from './helpers';
import { readFile } from 'node:fs/promises';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});
test.afterEach(async () => {
  await ext.close();
});

test('exporting task presets downloads a v1 bundle JSON', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Advanced"]').click();

  // Backup/restore lives under the Advanced tab's Data sub-tab.
  await page.locator('[data-ega-subtab="data"]').click();
  await page.locator('[data-ega-export-menu]').click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-ega-task-presets-export]').click(),
  ]);

  const path = await download.path();
  expect(path).toBeTruthy();
  if (!path) throw new Error('download.path() returned null');
  const text = await readFile(path, 'utf-8');
  const parsed = JSON.parse(text);
  expect(parsed.egaTaskPresets.v).toBe(1);
  expect(typeof parsed.egaTaskPresets.exportedAt).toBe('string');
  expect(parsed.egaTaskPresets.taskTemplates).toBeDefined();
  expect(parsed.egaTaskPresets.defaultTask).toBe('translate');
});
