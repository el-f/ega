/* coverage: templating.rules-editor.edit-rule-body */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const SEED_ID = 'flow-edit-test-rule-001';
const ORIGINAL = 'Always preserve URLs.';
const REPLACED = 'Always preserve URLs and email addresses verbatim.';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      rules: [
        {
          id: SEED_ID,
          body: ORIGINAL,
          category: 'always',
          scope: { tasks: [] },
          source: 'manual',
          addedAt: new Date().toISOString(),
          enabled: true,
        },
      ],
      perPresetTemplates: {},
      taskTemplates: {},
      temperature: 0.2,
      maxTokens: 2048,
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('clicking a rule body switches to edit mode and Ctrl+Enter persists', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="rules"]').click();
  await expect(page.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('rules-mounted');

  await page.locator('[data-ega-advanced-rules] > summary').click();
  await expect(page.locator(`[data-ega-rule-row][data-rule-id="${SEED_ID}"]`)).toBeVisible({
    timeout: 5_000,
  });
  timeline.markStep('advanced-open');

  const row = page.locator(`[data-ega-rule-row][data-rule-id="${SEED_ID}"]`);
  await expect(row).toBeVisible({ timeout: 5_000 });
  await row.locator('[data-ega-rule-body]').click();
  timeline.markStep('edit-mode');

  const editor = row.locator('[data-ega-rule-body-editor]');
  await expect(editor).toBeVisible({ timeout: 5_000 });
  await editor.fill(REPLACED);
  await editor.press('Control+Enter');
  timeline.markStep('committed');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.rules.find((r) => r.id === SEED_ID)?.body ?? '';
      },
      { timeout: 10_000 },
    )
    .toBe(REPLACED);
});
