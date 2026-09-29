/* coverage: templating.templates-editor.per-task-params-temperature-override */
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

test('per-task temperature input persists taskTemperatures.reword; clearing removes the key', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await page.locator('[data-ega-workbench-chip="reword"]').click();
  timeline.markStep('reword-chip-clicked');

  const tempInput = page.locator('[data-ega-task-temp="reword"]');
  await expect(tempInput).toBeVisible({ timeout: 10_000 });
  timeline.markStep('params-visible');

  await tempInput.fill('0.30');
  await tempInput.dispatchEvent('input');
  timeline.markStep('temperature-typed');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.taskTemperatures?.['reword'] ?? null;
      },
      { timeout: 10_000 },
    )
    .toBeCloseTo(0.3, 2);
  timeline.markStep('temperature-persisted');

  // A number input reports "" for a half-typed "0." too, so an empty box commits on change, not on input.
  await tempInput.fill('');
  await tempInput.dispatchEvent('change');
  timeline.markStep('temperature-cleared');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.taskTemperatures?.['reword'];
      },
      { timeout: 10_000 },
    )
    .toBeUndefined();
  timeline.markStep('temperature-key-removed');
});
