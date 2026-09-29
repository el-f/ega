/* coverage: templating.recipes-gallery.export-user-recipe */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

const SEED_ID = 'flow-export-recipe-001';
const SEED_LABEL = 'Flow Export Test Recipe';

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
          description: 'Seeded by export flow test.',
          rules: [{ body: 'Be concise.', category: 'always' }],
        },
      ],
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Export → clipboard receives non-empty serialized string', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();

  await ext.context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="recipes"]').click();
  await expect(page.locator('[data-ega-recipes-gallery]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('gallery-mounted');

  await page.locator('[data-ega-recipes-tab="yours"]').click();
  timeline.markStep('yours-tab');

  const card = page.locator(`[data-ega-recipe-id="${SEED_ID}"]`);
  await expect(card).toBeVisible({ timeout: 5_000 });
  await card.locator('[data-ega-recipe-export]').click();
  timeline.markStep('export-clicked');

  await expect(
    page.locator('[data-sonner-toast]', { hasText: 'Recipe copied to clipboard.' }),
  ).toBeVisible({ timeout: 10_000 });
  timeline.markStep('toast-visible');

  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip.length).toBeGreaterThan(0);
  timeline.markStep('clipboard-non-empty');
});
