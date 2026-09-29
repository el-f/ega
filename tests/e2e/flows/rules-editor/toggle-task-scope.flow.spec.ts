/* coverage: templating.rules-editor.toggle-task-scope */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const SEED_ID = 'flow-toggle-scope-001';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      rules: [
        {
          id: SEED_ID,
          body: 'Scope toggle test seed.',
          category: 'always',
          scope: { tasks: ['translate'] },
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

test('translate scope chip click removes task → scope.tasks becomes []', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="rules"]').click();
  await expect(page.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('rules-mounted');

  // Scope chips live inside the Advanced rules disclosure.
  await page.locator('[data-ega-advanced-rules] > summary').click();
  timeline.markStep('advanced-open');

  const row = page.locator(`[data-ega-rule-row][data-rule-id="${SEED_ID}"]`);
  await expect(row).toBeVisible({ timeout: 5_000 });

  const translateChip = row.locator('[data-ega-rule-task-chip="translate"]');
  await expect(translateChip).toBeVisible({ timeout: 5_000 });
  timeline.markStep('chip-visible');

  await translateChip.click();
  timeline.markStep('chip-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const rule = (s?.advanced.rules ?? []).find((r) => r.id === SEED_ID);
        return rule?.scope.tasks.length ?? -1;
      },
      { timeout: 10_000 },
    )
    .toBe(0);
  timeline.markStep('tasks-empty');

  await expect(translateChip).not.toBeVisible({ timeout: 5_000 });
  await expect(row.locator('.scope-all')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('all-tasks-visible');
});
