import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from './helpers';
import type { Settings } from '../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('disabling a built-in writes to disabledVarieties', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.getByRole('tab', { name: /^Languages$/ }).click();

  // Find the Arabizi row and toggle its checkbox off via the enable-arabizi id.
  await page.locator('#enable-arabizi').click();

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.disabledVarieties ?? [];
      },
      { timeout: 5_000 },
    )
    .toContain('arabizi');
});

test('editing a built-in creates a varietyOverrides entry; reset clears it', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.getByRole('tab', { name: /^Languages$/ }).click();

  await page.getByRole('button', { name: 'Edit Arabizi' }).click();
  const dialog = page.locator('[data-ega-language-dialog="arabizi"]');
  await dialog.getByLabel('Notes').fill('CUSTOM HINT FOR TEST');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.varietyOverrides['arabizi']?.hint;
      },
      { timeout: 5_000 },
    )
    .toBe('CUSTOM HINT FOR TEST');

  // Shown once the language differs from the built-in; removal is immediate, with Undo in the dialog.
  await page.getByRole('button', { name: 'Reset language' }).click();

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return Object.keys(s?.varietyOverrides ?? {});
      },
      { timeout: 5_000 },
    )
    .not.toContain('arabizi');
});

test('adding a custom language shows it in the list', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.getByRole('tab', { name: /^Languages$/ }).click();

  await page.getByRole('button', { name: 'Add language' }).click();
  const dialog = page.locator('[data-ega-language-dialog="new"]');
  await dialog.getByLabel('Name').fill('Mock Variety');
  await dialog.getByLabel('Notes').fill('for tests');
  await page.locator('[data-ega-dialog-done]').click();

  await expect(page.locator('[data-ega-variety-row]', { hasText: 'Mock Variety' })).toBeVisible();
});
