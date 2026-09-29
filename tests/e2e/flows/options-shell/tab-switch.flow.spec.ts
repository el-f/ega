/* coverage: options.shell.tab-switch */
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

test('clicking a tab swaps the active panel + tab aria state', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await expect(page.locator('#tab-translate')).toHaveAttribute('aria-selected', 'true', {
    timeout: 5_000,
  });
  timeline.markStep('default-active');

  await page.locator('#tab-backends').click();
  await expect(page.locator('#tab-backends')).toHaveAttribute('aria-selected', 'true', {
    timeout: 5_000,
  });
  await expect(page.locator('#tab-translate')).toHaveAttribute('aria-selected', 'false');
  timeline.markStep('backends-active');

  await expect(page.locator('h1, h2, h3').filter({ hasText: /^Backends/ })).toBeVisible({
    timeout: 5_000,
  });
});
