/* coverage: options.tasks.version-banner-show-diff */
import { test, expect } from '@playwright/test';
import { launchExtension, openTaskPrompt, seedSettings, type ExtensionHandle } from '../../helpers';
import { CURRENT_TEMPLATE_VERSION } from '../../../../src/shared/settings-schema';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: {
        system: '/* VERSION-DIFF-CUSTOM-SYS */ Custom system.',
        user: '/* VERSION-DIFF-CUSTOM-USR */ Translate: {{text}}',
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

test('Show diff button mounts TemplateDiffModal', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openTaskPrompt(page, 'translate');
  timeline.markStep('tab-open');

  const banner = page.locator('[data-ega-tpl-version-banner]');
  await expect(banner).toBeVisible({ timeout: 10_000 });
  timeline.markStep('banner-visible');

  await page.locator('[data-ega-tpl-show-diff]').click();
  timeline.markStep('show-diff-clicked');

  const diffModal = page.locator('[data-ega-diff-modal]');
  await expect(diffModal).toBeVisible({ timeout: 5_000 });
  timeline.markStep('diff-modal-mounted');
});
