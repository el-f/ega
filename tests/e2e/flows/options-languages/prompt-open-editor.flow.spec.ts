/* coverage: options.languages.prompt-open-editor */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  openLanguagePrompt,
  seedSettings,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { advanced: { perPresetTemplates: {} } });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Write a prompt opens the prompt editor inside the language row', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openLanguagePrompt(page, 'arabizi', 'Arabizi');
  const box = page.locator('[data-ega-variety-prompt="arabizi"]');
  await expect(box.locator('[data-ega-template-editor]')).toBeVisible();
  await expect(box.locator('[data-ega-slot-palette]')).toBeVisible();
  await expect(box.locator('[data-ega-template-save]')).toBeVisible();
  timeline.markStep('editor-open');
  timeline.report();
});
