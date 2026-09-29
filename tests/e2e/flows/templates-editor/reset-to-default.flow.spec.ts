/* coverage: templating.templates-editor.reset-to-default */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { DEFAULT_TEMPLATE } from '../../../../src/shared/prompts';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: {
        system: '/* RESET-FLOW-CUSTOM-SYSTEM */ Custom system template.',
        user: '/* RESET-FLOW-CUSTOM-USER */ Translate: {{text}}',
      },
      perPresetTemplates: {},
      temperature: 0.2,
      maxTokens: 2048,
      taskTemplates: {},
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Reset to default restores DEFAULT_TEMPLATE in storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('advanced-open');

  await expect(page.locator('[data-ega-template-editor]').first()).toBeVisible({
    timeout: 10_000,
  });

  // Sanity: pre-reset storage carries the seeded marker.
  const before = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  expect(before?.advanced.promptTemplate.system).toContain('RESET-FLOW-CUSTOM-SYSTEM');

  await page.locator('[data-ega-template-reset]').first().click();
  timeline.markStep('reset-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.promptTemplate.system ?? '';
      },
      { timeout: 10_000 },
    )
    .toBe(DEFAULT_TEMPLATE.system);
  timeline.markStep('storage-reset');
});
