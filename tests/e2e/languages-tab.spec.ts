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

  // .variety-row wraps both the row head and its editor panel.
  const card = page.locator('.variety-row').filter({ has: page.locator('#enable-arabizi') });
  await card.waitFor({ state: 'visible' });

  // Open the edit panel.
  await card.getByRole('button', { name: /^Edit$/ }).click();

  const hintArea = page.locator('#hint-arabizi');
  await hintArea.waitFor({ state: 'visible' });
  await hintArea.fill('CUSTOM HINT FOR TEST');
  await card.getByRole('button', { name: /^Save language$/ }).click();

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.varietyOverrides['arabizi']?.hint;
      },
      { timeout: 5_000 },
    )
    .toBe('CUSTOM HINT FOR TEST');

  // Shown when v.hasOverrides; removal is immediate, with an Undo toast.
  await card.getByRole('button', { name: /^Reset to built-in$/ }).click();

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

  // The add-form is hidden by default — open it via the header action button.
  await page.getByRole('button', { name: /^Add custom language$/ }).click();

  const labelInput = page.locator('.add-form').getByLabel(/^Label/);
  await labelInput.waitFor({ state: 'visible' });
  await labelInput.fill('Mock Variety');
  await page.locator('#new-hint').fill('for tests');
  await page.getByRole('button', { name: /^Add$/ }).click();

  await expect(page.locator('label').filter({ hasText: 'Mock Variety' })).toBeVisible();
});
