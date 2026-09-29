/* coverage: templating.templates-editor.compiled-preview */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('task-scope compiled preview renders the resolved user template; global keeps only the modal entry', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('advanced-open');

  await expect(page.locator('[data-ega-template-editor]').first()).toBeVisible({
    timeout: 10_000,
  });

  // Global's one full-prompt entry is the modal button — no inline disclosure duplicating it.
  await expect(page.locator('[data-ega-compile-preview]')).toHaveCount(0);
  await expect(page.locator('[data-ega-preview-prompt]')).toBeVisible();
  timeline.markStep('global-single-entry');

  // Task scope has no modal button, so the inline disclosure stays.
  await page.locator('[data-ega-workbench-chip="summarize"]').click();
  const previewSummary = page.locator('[data-ega-compile-preview] summary').first();
  await expect(previewSummary).toBeVisible({ timeout: 10_000 });
  await previewSummary.click();
  timeline.markStep('preview-open');

  // Sample request text is hardcoded inside TemplateEditor.compileNow().
  await expect(page.locator('[data-ega-preview-user]').first()).toContainText(
    'Hello world (sample text for preview).',
    { timeout: 5_000 },
  );
  timeline.markStep('sample-text-resolved');
});
