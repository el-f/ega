/* coverage: templating.rules-editor.jump-to-recipes-from-empty-state */
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

test('empty rules state "Pick a recipe" CTA switches workbench chip to recipes', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="rules"]').click();
  await expect(page.locator('[data-ega-rules-empty]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('empty-state-shown');

  const cta = page.getByRole('button', { name: /Pick a recipe/i });
  await expect(cta).toBeVisible({ timeout: 5_000 });
  await cta.click();
  timeline.markStep('cta-clicked');

  await expect(page.locator('[data-ega-workbench-chip="recipes"]')).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 5_000 },
  );
  timeline.markStep('recipes-chip-active');
});
