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

test('Use its own prompt opens the shared prompt editor inside the language dialog', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  const dialog = await openLanguagePrompt(page, 'arabizi', 'Arabizi');
  await expect(dialog.locator('[data-ega-prompt-editor]')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Insert variable/ })).toBeVisible();
  await expect(dialog.locator('[data-ega-prompt-tab="preview"]')).toBeVisible();
  timeline.markStep('editor-open');
  timeline.report();
});
