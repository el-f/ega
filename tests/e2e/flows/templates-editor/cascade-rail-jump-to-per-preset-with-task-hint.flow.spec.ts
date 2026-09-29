/* coverage: templating.templates-editor.cascade-rail-jump-to-per-preset-with-task-hint */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: '{{text}}' },
      taskTemplates: {},
      perPresetTemplates: {},
      temperature: 0.7,
      maxTokens: 2048,
      rules: [],
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('CascadeRail Per-preset pill on reword chip switches to per-preset and shows task-hint banner', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await page.locator('[data-ega-workbench-chip="reword"]').click();
  timeline.markStep('reword-chip-clicked');

  await expect(page.locator('[data-ega-cascade-rail]')).toBeVisible({ timeout: 10_000 });
  timeline.markStep('cascade-rail-visible');

  const perPresetPill = page.locator('[data-ega-cascade-layer="per-preset"]');
  await expect(perPresetPill).toBeVisible({ timeout: 5_000 });
  await perPresetPill.click();
  timeline.markStep('per-preset-pill-clicked');

  await expect(page.locator('[data-ega-workbench-chip="per-preset"]')).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 5_000 },
  );
  timeline.markStep('per-preset-chip-active');

  const hintBanner = page.locator('[data-ega-source-task-hint="reword"]');
  await expect(hintBanner).toBeVisible({ timeout: 5_000 });
  timeline.markStep('task-hint-visible');
});
