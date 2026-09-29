/* coverage: templating.recipes-gallery.apply-full-undo */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

// `explain-quick-tldr` ships 2 rules, so an empty seed makes the post-apply count predictable.
const TARGET_ID = 'explain-quick-tldr';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: '{{text}}' },
      taskTemplates: {},
      perPresetTemplates: {},
      temperature: 0.7,
      maxTokens: 2048,
      rules: [],
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('apply-full → Undo toast action → rules revert to pre-apply state', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await page.locator('[data-ega-workbench-chip="recipes"]').click();
  await expect(page.locator('[data-ega-recipes-gallery]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('gallery-mounted');

  const before = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  const preRuleCount = (before?.advanced.rules ?? []).length;

  const card = page.locator(`[data-ega-recipe-id="${TARGET_ID}"]`);
  await expect(card).toBeVisible({ timeout: 5_000 });
  await card.locator('[data-ega-recipe-apply]').click();
  timeline.markStep('apply-opened');

  const applyDlg = page.locator('.ega-dialog').filter({ hasText: 'Apply' }).first();
  await expect(applyDlg).toBeVisible({ timeout: 5_000 });
  await applyDlg.getByRole('button', { name: 'Apply', exact: true }).click();
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
  timeline.markStep('rules-applied');

  // Sonner renders the toast action as a button inside [data-sonner-toast].
  const undoBtn = page.locator('[data-sonner-toast] button', { hasText: 'Undo' }).first();
  await expect(undoBtn).toBeVisible({ timeout: 10_000 });
  timeline.markStep('undo-toast-visible');

  await undoBtn.click();
  timeline.markStep('undo-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return (s?.advanced.rules ?? []).length;
      },
      { timeout: 10_000 },
    )
    .toBe(preRuleCount);
  timeline.markStep('rules-reverted');
});
