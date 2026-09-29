/* coverage: templating.snippets.snippet-referenced-in-template-preview */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'Be helpful.', user: 'Translate: {{text}}' },
      snippets: { greeting: 'Hello' },
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

test('@@greeting@@ in system template resolves to "Hello" in the compiled preview', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  // Global scope has no inline compiled preview — use a task-scope editor.
  await page.locator('[data-ega-workbench-chip="summarize"]').click();
  await expect(page.locator('[data-ega-template-editor]').first()).toBeVisible({
    timeout: 10_000,
  });
  timeline.markStep('editor-visible');

  const sysSurface = page.locator('[data-ega-template-system] textarea').first();
  await sysSurface.click();
  await page.keyboard.press('Home');
  await page.keyboard.type('@@greeting@@ ');
  timeline.markStep('snippet-ref-typed');

  const previewSummary = page.locator('[data-ega-compile-preview] summary').first();
  await previewSummary.click();
  timeline.markStep('preview-opened');

  await expect(page.locator('[data-ega-preview-system]').first()).toContainText('Hello', {
    timeout: 5_000,
  });
  timeline.markStep('snippet-resolved');
});
