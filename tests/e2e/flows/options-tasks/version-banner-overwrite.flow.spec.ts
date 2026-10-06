/* coverage: options.tasks.version-banner-overwrite */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  openTaskPrompt,
  readStorage,
  seedSettings,
  type ExtensionHandle,
} from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { CURRENT_TEMPLATE_VERSION } from '../../../../src/shared/settings-schema';
import { DEFAULT_TEMPLATE } from '../../../../src/shared/prompts';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: {
        system: '/* VERSION-OVERWRITE-CUSTOM-SYS */ Custom.',
        user: '/* VERSION-OVERWRITE-CUSTOM-USR */ Translate: {{text}}',
      },
      templateVersion: CURRENT_TEMPLATE_VERSION - 1,
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

test('Use the new prompt replaces the prompt at once, and Undo puts the old one back', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openTaskPrompt(page, 'translate');
  timeline.markStep('tab-open');

  const banner = page.locator('[data-ega-tpl-version-banner]');
  await expect(banner).toBeVisible({ timeout: 10_000 });
  const before = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  timeline.markStep('banner-visible');

  await page.locator('[data-ega-tpl-overwrite]').click();
  timeline.markStep('use-new-clicked');

  const prompt = async (): Promise<string> =>
    (await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings'))?.advanced
      .promptTemplate.system ?? '';
  await expect.poll(prompt, { timeout: 10_000 }).toBe(DEFAULT_TEMPLATE.system);
  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  expect(s?.advanced.promptTemplate.user).toBe(DEFAULT_TEMPLATE.user);
  expect(s?.advanced.templateVersionAcknowledged).toBe(CURRENT_TEMPLATE_VERSION);
  await expect(banner).not.toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-ega-dialog-status]')).toContainText('Updated to the new prompt');
  timeline.markStep('storage-verified');

  await page.locator('[data-ega-dialog-undo]').click();
  await expect.poll(prompt, { timeout: 10_000 }).toBe(before?.advanced.promptTemplate.system);
  timeline.markStep('undone');
});
