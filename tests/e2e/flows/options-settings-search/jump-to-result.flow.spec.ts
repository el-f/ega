/* coverage: options.settings-search.jump-to-result */
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

test('Enter on a result jumps to the matching tab', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');
  // Default V2 landing is Translate; jump to a Backends-tab setting.
  await expect(page.locator('#tab-translate')).toHaveAttribute('aria-selected', 'true', {
    timeout: 5_000,
  });

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,');
  const input = page.locator('input[placeholder^="Search settings"]');
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.fill('backend order');
  // The suggestions share the list id, so wait on the results listbox before Enter.
  await expect(page.getByRole('listbox', { name: 'Settings results' })).toBeVisible({
    timeout: 5_000,
  });
  timeline.markStep('matched');

  await page.keyboard.press('Enter');
  // Dialog closes + the target tab becomes active. Backend Order lives on
  // the Backends tab.
  await expect(input).not.toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#tab-backends')).toHaveAttribute('aria-selected', 'true', {
    timeout: 5_000,
  });
});
