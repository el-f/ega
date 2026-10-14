import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from './helpers';

let ext: ExtensionHandle;

test.beforeAll(async () => {
  ext = await launchExtension();
});

test.afterAll(async () => {
  await ext.close();
});

// toHaveScreenshot disables CSS animations and retries until two captures match, so no settle sleep.
test.describe('Visual regression — stable surfaces', () => {
  test('popup empty state', async () => {
    const page = await ext.context.newPage();
    await page.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('popup-empty.png', { maxDiffPixels: 500 });
  });

  test('sidepanel empty state', async () => {
    const page = await ext.context.newPage();
    await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('sidepanel-empty.png', { maxDiffPixels: 500 });
  });

  test('options advanced landing', async () => {
    const page = await ext.context.newPage();
    await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    await page.waitForLoadState('networkidle');
    await page.locator('[role="tab"]:has-text("Advanced")').first().click();
    await page.locator('#adv-pane-data').waitFor();
    await expect(page).toHaveScreenshot('options-advanced-landing.png', {
      maxDiffPixels: 500,
    });
  });
});
