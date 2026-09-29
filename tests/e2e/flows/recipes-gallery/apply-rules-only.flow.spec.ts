/* coverage: templating.recipes-gallery.apply-rules-only */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import { BUNDLED_RECIPES } from '../../../../src/shared/recipes';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Use rules only appends recipe rules to settings.advanced.rules', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="recipes"]').click();
  await expect(page.locator('[data-ega-recipes-gallery]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('gallery-mounted');

  const targetRecipe = BUNDLED_RECIPES.find((r) => (r.rules?.length ?? 0) > 0);
  if (!targetRecipe) throw new Error('no bundled recipe ships rules — fixture invariant broken');

  const card = page.locator(`[data-ega-recipes-gallery] [data-ega-recipe-id="${targetRecipe.id}"]`);
  // Use-rules-only button only renders when the recipe has rules.
  await card.locator('[data-ega-recipe-rules-only]').click();
  timeline.markStep('rules-only-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return (s?.advanced.rules ?? []).filter(
          (r) => r.source === 'recipe' && r.recipeId === targetRecipe.id,
        ).length;
      },
      { timeout: 10_000 },
    )
    .toBe(targetRecipe.rules?.length ?? 0);
  timeline.markStep('rules-persisted');
});
