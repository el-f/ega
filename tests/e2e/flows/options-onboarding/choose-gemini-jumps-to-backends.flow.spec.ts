/* coverage: options.onboarding.choose-gemini-jumps-to-backends */
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

test('Add free Gemini key navigates to the Backends tab', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  await expect(page.locator('[data-ega-onboard="gemini"]')).toBeVisible({ timeout: 5_000 });
  await page.locator('[data-ega-onboard="gemini"]').click();
  timeline.markStep('clicked');

  await expect(page.locator('#tab-backends')).toHaveAttribute('aria-selected', 'true', {
    timeout: 5_000,
  });
});
