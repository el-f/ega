/* coverage: templating.templates-editor.chip-switches-template */
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

test('clicking the Reword chip surfaces the per-task editor body', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('advanced-open');

  await expect(page.locator('[data-ega-workbench-chip="global"]')).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 5_000 },
  );

  await page.locator('[data-ega-workbench-chip="reword"]').click();
  timeline.markStep('chip-clicked');

  await expect(page.locator('[data-ega-workbench-chip="reword"]')).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 5_000 },
  );
  // Per-task body wraps the TemplateEditor for non-translate-like tasks.
  await expect(page.locator('[data-ega-task-tab-wrapper="reword"]')).toBeVisible({
    timeout: 5_000,
  });
  await expect(
    page.locator('[data-ega-task-tab-wrapper="reword"] [data-ega-template-editor]'),
  ).toBeVisible({ timeout: 5_000 });
  timeline.markStep('per-task-editor-mounted');
});

test('clicking the Translate chip surfaces the delegation banner instead of an editor', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('advanced-open');

  await expect(page.locator('[data-ega-workbench-chip="global"]')).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 5_000 },
  );

  await page.locator('[data-ega-workbench-chip="translate"]').click();
  timeline.markStep('translate-chip-clicked');

  await expect(page.locator('[data-ega-workbench-chip="translate"]')).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 5_000 },
  );
  const banner = page.locator('[data-ega-delegation-banner][data-ega-delegation-task="translate"]');
  await expect(banner).toBeVisible({ timeout: 5_000 });
  await expect(banner.locator('[data-ega-delegation-jump]')).toBeVisible();
  await expect(page.locator('[data-ega-template-editor]')).toHaveCount(0);
  timeline.markStep('delegation-banner-mounted');
});
