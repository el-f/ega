/* coverage: templating.recipes-gallery.paste-shared-recipe */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

// Payload = btoa(encodeURIComponent(JSON.stringify({ kind: 'ega-recipe', recipe: {...} }))).

const ENCODED_RECIPE =
  'JTdCJTIya2luZCUyMiUzQSUyMmVnYS1yZWNpcGUlMjIlMkMlMjJyZWNpcGUlMjIlM0ElN0IlMjJpZCUyMiUzQSUyMmZsb3ctcGFzdGUtdGVzdC0wMDElMjIlMkMlMjJ0YXNrJTIyJTNBJTIydHJhbnNsYXRlJTIyJTJDJTIybGFiZWwlMjIlM0ElMjJGbG93JTIwUGFzdGUlMjBUZXN0JTIyJTJDJTIyZGVzY3JpcHRpb24lMjIlM0ElMjJJbXBvcnRlZCUyMHZpYSUyMHBhc3RlJTIwZmxvdyUyMHRlc3QuJTIyJTJDJTIycnVsZXMlMjIlM0ElNUIlN0IlMjJib2R5JTIyJTNBJTIyQWx3YXlzJTIwYmUlMjBjb25jaXNlLiUyMiUyQyUyMmNhdGVnb3J5JTIyJTNBJTIyYWx3YXlzJTIyJTdEJTVEJTdEJTdE';
const RECIPE_LABEL = 'Flow Paste Test';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Paste shared → Preview → Import → confirm → recipe in userRecipes', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await page.locator('[data-ega-workbench-chip="recipes"]').click();
  await expect(page.locator('[data-ega-recipes-gallery]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('gallery-mounted');

  await page.locator('[data-ega-recipe-paste]').click();
  const dialog = page.locator('.ega-dialog', { hasText: 'Paste shared recipe' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  timeline.markStep('paste-dialog-open');

  const pasteInput = dialog.locator('textarea[data-ega-recipe-paste-input]');
  await pasteInput.fill(ENCODED_RECIPE);
  timeline.markStep('payload-pasted');

  await dialog.locator('[data-ega-recipe-paste-decode]').click();
  timeline.markStep('preview-clicked');

  const preview = dialog.locator('[data-ega-recipe-paste-preview]');
  await expect(preview).toBeVisible({ timeout: 5_000 });
  await expect(preview).toContainText(RECIPE_LABEL);
  timeline.markStep('preview-shown');

  await dialog.locator('[data-ega-recipe-paste-apply]').click();
  timeline.markStep('import-clicked');

  const confirmDlg = page.locator('.ega-dialog', { hasText: 'Import recipe' });
  await expect(confirmDlg).toBeVisible({ timeout: 5_000 });
  await confirmDlg.getByRole('button', { name: 'Import', exact: true }).click();
  timeline.markStep('confirmed');

  // importRecipe reassigns the id, so match by label.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const recipes = (s?.advanced.userRecipes ?? []) as Array<{ label: string }>;
        return recipes.some((r) => r.label === RECIPE_LABEL);
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  timeline.markStep('recipe-persisted');
});
