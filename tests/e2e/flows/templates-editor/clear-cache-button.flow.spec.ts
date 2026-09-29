/* coverage: templating.templates-editor.clear-cache-button */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
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

test('Templates workbench Clear translation cache button shows success toast', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  const clearBtn = page.locator('[data-ega-clear-cache]');
  await expect(clearBtn).toBeVisible({ timeout: 10_000 });
  timeline.markStep('clear-cache-btn-visible');

  await clearBtn.click();
  timeline.markStep('clear-cache-clicked');

  const toast = page.locator('[data-sonner-toast]', { hasText: 'Translation cache cleared.' });
  await expect(toast).toBeVisible({ timeout: 10_000 });
  timeline.markStep('toast-visible');
});
