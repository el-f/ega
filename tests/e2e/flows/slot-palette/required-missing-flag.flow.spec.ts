/* coverage: templating.slot-palette.required-missing-flag */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: {
        system: 'You are a translator.',
        // {{text}} is dropped on purpose — that is what raises the required-missing flag.
        user: 'Translate the source. Target: {{targetLangLabel}}.',
      },
      perPresetTemplates: {},
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

test('palette decorates the `text` chip as required-missing when slot absent', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('advanced-open');

  const textChip = page.locator('[data-ega-slot-palette] [data-ega-slot-chip="text"]').first();
  await expect(textChip).toBeVisible({ timeout: 10_000 });
  await expect(textChip).toContainText(/required/i, { timeout: 5_000 });
  timeline.markStep('required-flag-visible');
});
