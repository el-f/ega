/* coverage: templating.templates-editor.per-task-params-tone-override-reword */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: '{{text}}' },
      taskTemplates: {},
      taskTones: {},
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

test('Reword tone select persists taskTones.reword; reset to inherit removes the key', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await page.locator('[data-ega-workbench-chip="reword"]').click();
  timeline.markStep('reword-chip-clicked');

  const toneSelect = page.locator('[data-ega-task-tone="reword"]');
  await expect(toneSelect).toBeVisible({ timeout: 10_000 });
  timeline.markStep('tone-select-visible');

  await toneSelect.selectOption('formal');
  timeline.markStep('tone-selected');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.taskTones['reword'] ?? null;
      },
      { timeout: 10_000 },
    )
    .toBe('formal');
  timeline.markStep('tone-persisted');

  await toneSelect.selectOption('');
  timeline.markStep('tone-cleared');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.taskTones['reword'];
      },
      { timeout: 10_000 },
    )
    .toBeUndefined();
  timeline.markStep('tone-key-removed');
});
