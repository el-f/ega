/* coverage: templating.recipes-gallery.save-current-as-recipe */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const RECIPE_LABEL = 'EGA Flow Test Recipe';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('+ New from current → fill label → save → entry in userRecipes + Yours tab active', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await page.locator('[data-ega-workbench-chip="recipes"]').click();
  await expect(page.locator('[data-ega-recipes-gallery]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('gallery-mounted');

  await page.locator('[data-ega-recipe-new]').click();
  const dialog = page.locator('.ega-dialog', { hasText: 'New recipe from current' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  timeline.markStep('new-dialog-open');

  await dialog.locator('input[data-ega-recipe-new-label]').fill(RECIPE_LABEL);
  timeline.markStep('label-filled');

  await dialog.locator('[data-ega-recipe-new-save]').click();
  timeline.markStep('saved');

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
  timeline.markStep('entry-persisted');

  await expect(page.locator('[data-ega-recipes-tab="yours"]')).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 5_000 },
  );
  timeline.markStep('yours-tab-active');
});
