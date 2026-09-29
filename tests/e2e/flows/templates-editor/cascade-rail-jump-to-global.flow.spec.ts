/* coverage: templating.templates-editor.cascade-rail-jump-to-global */
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

test('CascadeRail Global pill on reword chip switches workbench to global', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await page.locator('[data-ega-workbench-chip="reword"]').click();
  timeline.markStep('reword-chip-clicked');

  await expect(page.locator('[data-ega-cascade-rail]')).toBeVisible({ timeout: 10_000 });
  timeline.markStep('cascade-rail-visible');

  const globalPill = page.locator('[data-ega-cascade-layer="global"]');
  await expect(globalPill).toBeVisible({ timeout: 5_000 });
  await globalPill.click();
  timeline.markStep('global-pill-clicked');

  await expect(page.locator('[data-ega-workbench-chip="global"]')).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 5_000 },
  );
  timeline.markStep('global-chip-active');

  await expect(page.locator('[data-ega-template-editor]').first()).toBeVisible({ timeout: 10_000 });
  timeline.markStep('global-editor-mounted');
});
