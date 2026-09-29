/* coverage: templating.templates-editor.dirty-badge-clears-after-save */
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

test('typing makes dirty badge appear; Save clears it and disables Save button', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await expect(page.locator('[data-ega-template-editor]').first()).toBeVisible({
    timeout: 10_000,
  });
  timeline.markStep('editor-mounted');

  const saveBtn = page.locator('[data-ega-template-save]').first();
  await expect(saveBtn).toBeDisabled();

  const dirtyBadge = page.locator('.dirty-badge').first();
  await expect(dirtyBadge).not.toBeVisible();

  const sysSurface = page.locator('[data-ega-template-system] textarea').first();
  await sysSurface.click();
  await page.keyboard.press('Home');
  await page.keyboard.type('/* DIRTY-BADGE-TEST */ ');
  timeline.markStep('typed');

  await expect(dirtyBadge).toBeVisible({ timeout: 5_000 });
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
  timeline.markStep('dirty-badge-visible');

  await saveBtn.click();
  timeline.markStep('save-clicked');

  await expect(dirtyBadge).not.toBeVisible({ timeout: 5_000 });
  await expect(saveBtn).toBeDisabled({ timeout: 5_000 });
  timeline.markStep('badge-cleared');
});
