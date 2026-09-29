/* coverage: templating.per-preset-override.per-preset-inherits-global-when-no-override */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

const GLOBAL_SYS = 'GLOBAL_SYSTEM_BODY_UNIQUE_MARKER';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: GLOBAL_SYS, user: 'Translate: {{text}}' },
      snippets: {},
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

test('picking a preset with no override seeds the editor from the global promptTemplate', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="per-preset"]').click();
  await page.locator('[data-ega-prompt-workbench] select').first().selectOption('arabizi');
  timeline.markStep('preset-picked');

  await expect(
    page.locator('[data-ega-prompt-workbench] [data-ega-template-editor]').first(),
  ).toBeVisible({ timeout: 10_000 });
  timeline.markStep('editor-visible');

  const sysSurface = page
    .locator('[data-ega-prompt-workbench] [data-ega-template-system] textarea')
    .first();
  await expect(sysSurface).toHaveValue(GLOBAL_SYS, { timeout: 5_000 });
  timeline.markStep('global-body-confirmed');
});
