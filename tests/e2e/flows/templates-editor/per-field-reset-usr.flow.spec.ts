/* coverage: templating.templates-editor.per-field-reset-usr */
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
        system: '/* PER-FIELD-USR-PRESERVED-SYS */ Custom system body.',
        user: '/* PER-FIELD-USR-CUSTOM */ Translate: {{text}}',
      },
      perPresetTemplates: {},
      temperature: 0.2,
      maxTokens: 2048,
      taskTemplates: {},
      rules: [],
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('per-field user reset restores inherited default; system body preserved', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await expect(page.locator('[data-ega-template-editor]').first()).toBeVisible({
    timeout: 10_000,
  });
  timeline.markStep('editor-mounted');

  const usrResetBtn = page.locator('[data-ega-reset-field][aria-label*="Reset user"]');
  await expect(usrResetBtn).toBeVisible({ timeout: 5_000 });
  await usrResetBtn.click();
  timeline.markStep('usr-reset-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.promptTemplate.user ?? '';
      },
      { timeout: 10_000 },
    )
    .toBe(DEFAULT_TEMPLATE.user);

  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  expect(s?.advanced.promptTemplate.system).toContain('PER-FIELD-USR-PRESERVED-SYS');
  timeline.markStep('storage-verified');
});
