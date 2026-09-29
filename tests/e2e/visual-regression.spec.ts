import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from './helpers';

let ext: ExtensionHandle;

test.beforeAll(async () => {
  ext = await launchExtension();
});

test.afterAll(async () => {
  await ext.close();
});

test.describe('Visual regression — stable surfaces', () => {
  test('popup empty state', async () => {
    const page = await ext.context.newPage();
    await page.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
    await page.waitForLoadState('networkidle');
    // Screenshot needs a stable paint — CSS transitions and Svelte reactive
    // updates run after networkidle; a fixed settle window prevents diff noise.
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('popup-empty.png', { maxDiffPixels: 500 });
  });

  test('sidepanel empty state', async () => {
    const page = await ext.context.newPage();
    await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
    await page.waitForLoadState('networkidle');
    // Screenshot needs a stable paint — CSS transitions and Svelte reactive
    // updates run after networkidle; a fixed settle window prevents diff noise.
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('sidepanel-empty.png', { maxDiffPixels: 500 });
  });

  test('options advanced landing', async () => {
    const page = await ext.context.newPage();
    await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    await page.waitForLoadState('networkidle');
    await page.locator('[role="tab"]:has-text("Advanced")').first().click();
    // Tab-panel content animates in after click; settle before screenshot.
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot('options-advanced-landing.png', {
      maxDiffPixels: 500,
    });
  });
});
