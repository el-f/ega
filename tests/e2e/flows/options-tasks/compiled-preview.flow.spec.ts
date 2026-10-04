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

test('the Translate dialog shows the compiled prompt for a sample request', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openTaskPrompt(page, 'translate');
  timeline.markStep('dialog-open');

  const previewSummary = page.locator('[data-ega-compile-preview] summary').first();
  await expect(previewSummary).toBeVisible({ timeout: 10_000 });
  await previewSummary.click();
  timeline.markStep('preview-open');

  // Sample request text is hardcoded inside TemplateEditor.compileNow().
  await expect(page.locator('[data-ega-preview-user]').first()).toContainText(
    'Hello world (sample text for preview).',
    { timeout: 5_000 },
  );
  await expect(page.locator('[data-ega-preview-system]').first()).not.toBeEmpty();
  timeline.markStep('sample-text-resolved');
  timeline.report();
});
