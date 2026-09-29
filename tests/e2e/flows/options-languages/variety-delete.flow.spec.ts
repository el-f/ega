/* coverage: options.languages.variety-delete */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('delete custom language removes the entry from ega.customLanguages', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-languages').click();

  await page.locator('button[aria-label="Add custom language"]').click();
  // Shared `<Input>` primitive generates a UUID-style id; resolve via label.
  await page.getByLabel('Label').fill('DeleteMe');
  await page.locator('#new-hint').fill('Will be deleted in the next assertion.');
  await page.locator('button.ega-btn.variant-primary', { hasText: 'Add' }).click();
  timeline.markStep('seeded');

  await expect
    .poll(
      async () => {
        const customs = await readStorage<unknown>(
          ext.context,
          ext.extensionId,
          'ega.customLanguages',
        );
        return Array.isArray(customs) && customs.length > 0;
      },
      { timeout: 5_000 },
    )
    .toBe(true);

  // Each variety row has a Delete IconButton labeled "Delete custom language".
  // Custom rows are the only ones with that affordance.
  const del = page.locator('button[aria-label="Delete custom language"]').first();
  await expect(del).toBeVisible({ timeout: 5_000 });
  await del.click();
  // Delete now goes through a confirm dialog — click its "Delete" button
  // (exact, so it doesn't also match the row's "Delete custom language").
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  timeline.markStep('deleted');

  await expect
    .poll(
      async () => {
        const customs = await readStorage<unknown>(
          ext.context,
          ext.extensionId,
          'ega.customLanguages',
        );
        return Array.isArray(customs) ? customs.length : -1;
      },
      { timeout: 5_000 },
    )
    .toBe(0);
});
