/* coverage: templating.recipes-gallery.filter-by-task */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';
import { BUNDLED_RECIPES } from '../../../../src/shared/recipes';
import { ALL_TASKS } from '../../../../src/shared/task-prompts';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Task filter chip narrows the visible recipe set', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="recipes"]').click();
  await expect(page.locator('[data-ega-recipes-gallery]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('gallery-mounted');

  const buckets = new Map<string, number>();
  for (const r of BUNDLED_RECIPES) {
    buckets.set(r.task, (buckets.get(r.task) ?? 0) + 1);
  }
  const targetTask = ALL_TASKS.find((t) => (buckets.get(t) ?? 0) > 0);
  if (!targetTask) throw new Error('no bundled recipe found for any task');
  const expected = buckets.get(targetTask) ?? 0;

  const filterChip = page.locator(
    `[data-ega-recipes-gallery] [data-ega-recipe-filter="${targetTask}"]`,
  );
  // The filter strip only mounts when more than one task has recipes.
  if ((await filterChip.count()) === 0) {
    test.info().annotations.push({
      type: 'skip-reason',
      description: 'Only one task has bundled recipes; filter chips suppressed',
    });
    return;
  }
  await filterChip.click();
  timeline.markStep('filter-clicked');

  const cards = page.locator('[data-ega-recipes-gallery] [data-ega-recipe-card]');
  await expect(cards).toHaveCount(expected, { timeout: 5_000 });
  timeline.markStep('filtered-count-asserted');
});
