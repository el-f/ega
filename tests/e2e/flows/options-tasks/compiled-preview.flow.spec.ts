/* coverage: options.tasks.compiled-preview */
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

test('the Translate dialog shows the prompt as sent for a sample request', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openTaskPrompt(page, 'translate');
  timeline.markStep('dialog-open');

  await page.getByRole('tab', { name: 'Preview' }).click();
  timeline.markStep('preview-open');

  await expect(page.locator('[data-ega-preview-user]').first()).toContainText(
    'Hello world (sample text for preview).',
    { timeout: 5_000 },
  );
  // The answer format is appended by the builder, so the preview shows it.
  await expect(page.locator('[data-ega-preview-system]').first()).toContainText('Return JSON ONLY');
  // The fields are hidden, not gone: Edit brings them back as they were.
  await page.getByRole('tab', { name: 'Edit' }).click();
  await expect(page.locator('[data-ega-template-system] textarea')).toBeVisible();
  timeline.markStep('sample-text-resolved');
  timeline.report();
});
