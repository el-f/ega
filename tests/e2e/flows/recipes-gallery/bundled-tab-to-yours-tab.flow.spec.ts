/* coverage: templating.recipes-gallery.bundled-tab-to-yours-tab */
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

test('Bundled tab → click Yours → empty-state renders, bundled groups unmount', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="recipes"]').click();
  await expect(page.locator('[data-ega-recipes-gallery]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('gallery-mounted');

  await expect(page.locator('[data-ega-recipes-tab="bundled"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await expect(page.locator('[data-ega-recipes-group]').first()).toBeVisible({ timeout: 5_000 });
  timeline.markStep('bundled-visible');

  await page.locator('[data-ega-recipes-tab="yours"]').click();
  timeline.markStep('yours-clicked');

  await expect(page.locator('[data-ega-recipes-tab="yours"]')).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 5_000 },
  );

  await expect(page.locator('[data-ega-recipes-group]')).not.toBeVisible({ timeout: 5_000 });
  timeline.markStep('bundled-gone');

  await expect(page.locator('[data-ega-recipes-gallery]')).toContainText('No saved recipes yet', {
    timeout: 5_000,
  });
  timeline.markStep('empty-state-visible');
});
