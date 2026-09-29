/* coverage: templating.per-preset-override.pick-preset-shows-editor */
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

test('Picking a preset surfaces the TemplateEditor on the per-preset chip', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="per-preset"]').click();
  await expect(page.getByText(/No per-language overrides yet/i)).toBeVisible({
    timeout: 10_000,
  });
  timeline.markStep('empty-state');

  // The preset picker is the only <select> inside this chip panel.
  await page.locator('[data-ega-prompt-workbench] select').first().selectOption('arabizi');
  timeline.markStep('preset-picked');

  await expect(
    page.locator('[data-ega-prompt-workbench] [data-ega-template-editor]').first(),
  ).toBeVisible({ timeout: 10_000 });

  // Without the scope marker the editor frame looks identical to the global one.
  const scopeBanner = page
    .locator('[data-ega-prompt-workbench] [data-ega-template-scope-banner]')
    .first();
  await expect(scopeBanner).toBeVisible({ timeout: 5_000 });
  await expect(scopeBanner).toHaveAttribute('data-ega-template-scope', 'preset');
  await expect(scopeBanner).toContainText(/per-language/i);
});
