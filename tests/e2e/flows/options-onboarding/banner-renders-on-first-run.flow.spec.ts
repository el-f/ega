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

test('A fresh install shows the notice, and its button opens Get started on Backends', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  timeline.markStep('opened');

  const notice = page.locator('[data-ega-status-bar="needs-key"]');
  await expect(notice).toContainText('No backend is set up yet', { timeout: 5_000 });
  await page.getByRole('button', { name: 'Set up a backend' }).click();
  timeline.markStep('set-up');

  await expect(page.locator('#tab-backends')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-ega-get-started]')).toBeVisible();
  await expect(notice).toHaveCount(0);
  for (const name of ['Use a free Gemini key', 'Use another API key', 'Run on this computer']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
  await expect(page.locator('[data-ega-onboard="dismiss"]')).toBeVisible();
});
