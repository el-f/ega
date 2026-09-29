/* coverage: templating.recipes-gallery.save-current-label-too-long */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const LONG_LABEL = 'A'.repeat(81);

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('81-char label → error shown, dialog stays open, no storage write', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="recipes"]').click();
  await expect(page.locator('[data-ega-recipes-gallery]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('gallery-mounted');

  const before = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  const recipesCountBefore = (before?.advanced.userRecipes ?? []).length;

  await page.locator('[data-ega-recipe-new]').click();
  const dialog = page.locator('.ega-dialog', { hasText: 'New recipe from current' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  timeline.markStep('dialog-open');

  // maxlength="80" blocks typing, so set the value in JS to reach the guard in submit().
  const labelInput = dialog.locator('input[data-ega-recipe-new-label]');
  await labelInput.evaluate((el: HTMLInputElement, val: string) => {
    el.removeAttribute('maxlength');
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, LONG_LABEL);
  await dialog.locator('[data-ega-recipe-new-save]').click();
  timeline.markStep('submitted');

  await expect(dialog.locator('[role="alert"]')).toBeVisible({ timeout: 5_000 });
  await expect(dialog.locator('[role="alert"]')).toContainText(
    'Label is too long (max 80 characters).',
  );
  timeline.markStep('error-visible');

  // The heading only renders while the dialog is open.
  await expect(dialog.locator('h2')).toBeVisible();

  const after = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  const recipesCountAfter = (after?.advanced.userRecipes ?? []).length;
  expect(recipesCountAfter).toBe(recipesCountBefore);
  timeline.markStep('storage-unchanged');
});
