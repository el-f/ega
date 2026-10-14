/* coverage: templating.rules-editor.edit-category */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const SEED_ID = 'flow-edit-category-001';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      rules: [
        {
          id: SEED_ID,
          body: 'Category edit seed.',
          category: 'always',
          scope: { tasks: [] },
          source: 'manual',
          addedAt: new Date().toISOString(),
          enabled: true,
        },
      ],
      perPresetTemplates: {},
      temperature: 0.2,
      maxTokens: 2048,
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('the Type select in the open row updates storage from always → never', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-glossary').click();

  await expect(page.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('rules-mounted');

  const row = page.locator(`[data-ega-rule-row][data-rule-id="${SEED_ID}"]`);
  await expect(row).toBeVisible({ timeout: 5_000 });

  await row.locator('[data-ega-rule-edit]').click();
  const catSelect = row.locator('[data-ega-rule-category]');
  await expect(catSelect).toBeVisible({ timeout: 5_000 });
  await expect(catSelect).toHaveValue('always');
  timeline.markStep('select-verified');

  await catSelect.selectOption('never');
  timeline.markStep('select-changed');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const rule = (s?.advanced.rules ?? []).find((r) => r.id === SEED_ID);
        return rule?.category ?? null;
      },
      { timeout: 10_000 },
    )
    .toBe('never');
  timeline.markStep('storage-updated');
});
