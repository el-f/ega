/* coverage: templating.templates-editor.task-chip-reset-clears-task-template */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const SEEDED_USER = '/* TASK-CHIP-RESET-CLEARS */ Reword: {{text}}';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: '{{text}}' },
      taskTemplates: {
        reword: { system: 'reword-sys', user: SEEDED_USER },
      },
      perPresetTemplates: {},
      temperature: 0.2,
      maxTokens: 2048,
      rules: [],
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Reword chip Reset to task default removes taskTemplates.reword from storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await page.locator('[data-ega-workbench-chip="reword"]').click();
  timeline.markStep('reword-chip-clicked');

  await expect(
    page.locator('[data-ega-task-tab-wrapper="reword"] [data-ega-template-editor]'),
  ).toBeVisible({ timeout: 10_000 });
  timeline.markStep('task-editor-mounted');

  const resetBtn = page
    .locator('[data-ega-task-tab-wrapper="reword"] [data-ega-template-reset]')
    .first();
  await expect(resetBtn).toBeVisible({ timeout: 5_000 });
  await resetBtn.click();
  timeline.markStep('reset-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const tpl = s?.advanced.taskTemplates;
        if (!tpl) return false;
        return !Object.hasOwn(tpl, 'reword');
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  timeline.markStep('storage-verified');
});
