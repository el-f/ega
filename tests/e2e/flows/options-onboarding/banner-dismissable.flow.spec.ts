/* coverage: options.onboarding.banner-dismissable */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('Advanced / skip flips onboardingDismissed and hides the banner', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  await expect(page.locator('[data-ega-onboard="dismiss"]')).toBeVisible({ timeout: 5_000 });
  await page.locator('[data-ega-onboard="dismiss"]').click();
  timeline.markStep('dismissed');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.onboardingDismissed;
      },
      { timeout: 5_000 },
    )
    .toBe(true);

  await expect(page.getByRole('region', { name: 'Get started with Ega' })).not.toBeVisible({
    timeout: 5_000,
  });
});
