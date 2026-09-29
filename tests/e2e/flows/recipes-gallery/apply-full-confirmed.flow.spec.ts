/* coverage: templating.recipes-gallery.apply-full-confirmed */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const TARGET_ID = 'explain-quick-tldr';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Apply (full) on a recipe persists rules + per-task params via confirm', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="recipes"]').click();
  await expect(page.locator('[data-ega-recipes-gallery]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('gallery-mounted');

  const card = page.locator(`[data-ega-recipes-gallery] [data-ega-recipe-id="${TARGET_ID}"]`);
  await card.locator('[data-ega-recipe-apply]').click();
  timeline.markStep('apply-opened');

  // Apply opens a structured-diff Dialog (not confirmDialog string body).
  const dialog = page.locator('.ega-dialog').filter({ hasText: 'Apply' }).first();
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  timeline.markStep('apply-confirmed');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return (s?.advanced.rules ?? []).filter((r) => r.recipeId === TARGET_ID).length;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
  timeline.markStep('rules-landed');

  // Per-task max tokens param from the recipe — 200 for explain.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.taskMaxTokens?.['explain'] ?? null;
      },
      { timeout: 5_000 },
    )
    .toBe(200);
  timeline.markStep('params-landed');
});
