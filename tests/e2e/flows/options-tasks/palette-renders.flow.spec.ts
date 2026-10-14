/* coverage: options.tasks.palette-renders */
import { test, expect } from '@playwright/test';
import { launchExtension, openTaskPrompt, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('the Insert variable list names each variable in plain words, with its meaning', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openTaskPrompt(page, 'translate');
  timeline.markStep('editor-open');

  await page.locator('[data-ega-slot-insert-picker]').click();
  const text = page.locator('[data-ega-variable-picker] [data-ega-variable="text"]');
  await expect(text).toBeVisible({ timeout: 5_000 });
  await expect(text).toContainText('Selected text');
  await expect(text).toContainText('{{text}}');
  await expect(text).toContainText('The text you selected; the message must contain it');
  timeline.markStep('text-row-visible');
});
