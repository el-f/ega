/* coverage: templating.recipes-gallery.bundled-list-renders */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';
import { BUNDLED_RECIPES } from '../../../../src/shared/recipes';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Recipes chip renders every bundled recipe card', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('advanced-open');

  await page.locator('[data-ega-workbench-chip="recipes"]').click();
  await expect(page.locator('[data-ega-recipes-gallery]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('gallery-mounted');

  const cards = page.locator('[data-ega-recipes-gallery] [data-ega-recipe-card]');
  await expect(cards).toHaveCount(BUNDLED_RECIPES.length, { timeout: 5_000 });

  // A count-only check passes when the cards mount with empty data.
  const firstId = BUNDLED_RECIPES[0]?.id;
  expect(firstId, 'BUNDLED_RECIPES empty — fixture lost').toBeTruthy();
  await expect(
    page.locator(`[data-ega-recipes-gallery] [data-ega-recipe-id="${firstId}"]`),
  ).toBeVisible({ timeout: 5_000 });
  timeline.markStep('first-card-asserted');
});
