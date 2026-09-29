/* coverage: templating.recipes-gallery.delete-user-recipe */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const SEED_ID = 'flow-delete-recipe-001';
const SEED_LABEL = 'Flow Delete Test Recipe';

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
      userRecipes: [
        {
          id: SEED_ID,
          task: 'translate',
          label: SEED_LABEL,
          description: 'Seeded by flow test — safe to delete.',
          rules: [{ body: 'Test rule.', category: 'always' }],
        },
      ],
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Delete → Confirm removes user recipe from storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await page.locator('[data-ega-workbench-chip="recipes"]').click();
  await expect(page.locator('[data-ega-recipes-gallery]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('gallery-mounted');

  await page.locator('[data-ega-recipes-tab="yours"]').click();
  timeline.markStep('yours-tab-clicked');

  const card = page.locator(`[data-ega-recipe-id="${SEED_ID}"]`);
  await expect(card).toBeVisible({ timeout: 5_000 });
  await card.locator('[data-ega-recipe-delete]').click();
  timeline.markStep('delete-clicked');

  const confirmDlg = page.locator('.ega-dialog', { hasText: 'Delete recipe' });
  await expect(confirmDlg).toBeVisible({ timeout: 5_000 });
  await confirmDlg.getByRole('button', { name: 'Delete', exact: true }).click();
  timeline.markStep('confirmed');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const recipes = (s?.advanced.userRecipes ?? []) as Array<{ id: string }>;
        return recipes.some((r) => r.id === SEED_ID);
      },
      { timeout: 10_000 },
    )
    .toBe(false);
  timeline.markStep('recipe-removed');

  await expect(card).not.toBeVisible({ timeout: 5_000 });
  timeline.markStep('card-gone');
});
