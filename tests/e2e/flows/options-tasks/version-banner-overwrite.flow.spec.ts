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

test('Overwrite replaces promptTemplate with default and sets acknowledged version', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openTaskPrompt(page, 'translate');
  timeline.markStep('tab-open');

  const banner = page.locator('[data-ega-tpl-version-banner]');
  await expect(banner).toBeVisible({ timeout: 10_000 });
  timeline.markStep('banner-visible');

  await page.locator('[data-ega-tpl-overwrite]').click();
  timeline.markStep('overwrite-clicked');

  // The confirm dialog opens over the task dialog, whose banner has an Overwrite button too.
  const confirmBtn = page
    .locator('.ega-dialog', { hasText: 'Overwrite prompt template?' })
    .getByRole('button', { name: 'Overwrite', exact: true });
  await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
  await confirmBtn.click();
  timeline.markStep('confirm-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.promptTemplate.system ?? '';
      },
      { timeout: 10_000 },
    )
    .toBe(DEFAULT_TEMPLATE.system);

  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  expect(s?.advanced.promptTemplate.user).toBe(DEFAULT_TEMPLATE.user);
  expect(s?.advanced.templateVersionAcknowledged).toBe(CURRENT_TEMPLATE_VERSION);
  timeline.markStep('storage-verified');

  await expect(banner).not.toBeVisible({ timeout: 5_000 });
  timeline.markStep('banner-dismissed');
});
