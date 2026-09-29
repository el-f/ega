/* coverage: templating.recipes-gallery.paste-shared-invalid-payload */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('garbage input → "does not look like a recipe code" error → no Import button', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="recipes"]').click();
  await expect(page.locator('[data-ega-recipes-gallery]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('gallery-mounted');

  await page.locator('[data-ega-recipe-paste]').click();
  const dialog = page.locator('.ega-dialog', { hasText: 'Paste shared recipe' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  timeline.markStep('paste-dialog-open');

  await dialog
    .locator('textarea[data-ega-recipe-paste-input]')
    .fill('this-is-not-a-valid-payload!!!');
  await dialog.locator('[data-ega-recipe-paste-decode]').click();
  timeline.markStep('preview-clicked');

  await expect(dialog.locator('[role="alert"]')).toBeVisible({ timeout: 5_000 });
  await expect(dialog.locator('[role="alert"]')).toContainText(
    'This does not look like a recipe code.',
  );
  timeline.markStep('error-visible');

  // Preview keeps its place instead of swapping to Import.
  await expect(dialog.locator('[data-ega-recipe-paste-apply]')).not.toBeVisible();
  await expect(dialog.locator('[data-ega-recipe-paste-decode]')).toBeVisible();
  timeline.markStep('import-absent');
});
