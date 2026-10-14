/* coverage: options.about.version-display */
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

test('About tab renders Privacy + Credits sections with source link', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-about').click();
  timeline.markStep('about-active');

  // Privacy section heading.
  await expect(page.getByRole('heading', { name: /Privacy/i })).toBeVisible({ timeout: 5_000 });
  // Credits + GitHub link.
  await expect(page.locator('a[data-ega-source-link]')).toBeVisible();
  await expect(page.locator('a[data-ega-source-link]')).toHaveAttribute(
    'href',
    /github\.com\/el-f\/ega/,
  );
});
