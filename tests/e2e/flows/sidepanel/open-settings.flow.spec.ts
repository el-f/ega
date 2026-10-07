/* coverage: translation.sidepanel.open-settings */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

// options_ui.open_in_tab is true, so openOptionsPage() lands as a new page in this context.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('header More → Settings opens the options shell in a new tab', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  timeline.markStep('sidepanel-opened');

  // Settings lives in the header's More menu; the header has no cog of its own.
  const more = page.locator('[data-ega-header-more]');
  await expect(more).toBeVisible({ timeout: 5_000 });
  await expect(
    page.locator('.sp-header').getByRole('button', { name: 'Open settings' }),
  ).toHaveCount(0);
  await more.click();
  const item = page.locator('[data-ega-open-settings]');
  await expect(item).toHaveText('Settings');
  // Keyboard shortcuts comes right before it.
  await expect(page.locator('[data-ega-show-shortcuts]')).toHaveText('Keyboard shortcuts');
  timeline.markStep('menu-open');

  const newPagePromise = ext.context.waitForEvent('page', { timeout: 5_000 });
  await item.click();
  timeline.markStep('settings-picked');

  const opened = await newPagePromise;
  await opened.waitForLoadState('domcontentloaded');
  expect(opened.url()).toMatch(
    new RegExp(`^chrome-extension://${ext.extensionId}/src/options/`, 'i'),
  );
  timeline.markStep('options-open');
});
