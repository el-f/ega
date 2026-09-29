/* coverage: templating.per-preset-override.clear-override */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const PRESET_ID = 'arabizi';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      perPresetTemplates: {
        [PRESET_ID]: {
          system: '/* SEEDED OVERRIDE */ Custom arabizi system.',
          user: 'Custom arabizi user template: {{text}}',
        },
      },
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

test('Clear preset override removes the preset entry from storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="per-preset"]').click();
  await page.locator('[data-ega-prompt-workbench] select').first().selectOption(PRESET_ID);
  timeline.markStep('preset-picked');

  const resetBtn = page.locator('[data-ega-prompt-workbench] [data-ega-template-reset]').first();
  await expect(resetBtn).toBeVisible({ timeout: 10_000 });
  await resetBtn.click();
  timeline.markStep('clear-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return Object.hasOwn(s?.advanced.perPresetTemplates ?? {}, PRESET_ID);
      },
      { timeout: 10_000 },
    )
    .toBe(false);
});
