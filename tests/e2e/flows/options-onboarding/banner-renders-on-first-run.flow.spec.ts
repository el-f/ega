/* coverage: options.onboarding.banner-renders-on-first-run */
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

test('Welcome banner renders on a fresh install with no keys', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  timeline.markStep('opened');

  await expect(page.getByRole('region', { name: 'Get started with Ega' })).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.locator('[data-ega-onboard="gemini"]')).toBeVisible();
  await expect(page.locator('[data-ega-onboard="dismiss"]')).toBeVisible();
});
