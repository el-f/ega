/* coverage: options.settings-search.open-shortcut */
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

test('Ctrl+, opens the settings-search modal', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');
  timeline.markStep('opened');

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,');
  // The settings-search dialog mounts a placeholder input "Search settings…".
  await expect(page.locator('input[placeholder^="Search settings"]')).toBeVisible({
    timeout: 5_000,
  });
  timeline.markStep('dialog-mounted');
});
