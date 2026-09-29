/* coverage: translation.sidepanel.settings-cog */
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

test('settings cog opens the options shell in a new tab', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  timeline.markStep('sidepanel-opened');

  const cog = page.getByRole('button', { name: 'Open settings' });
  await expect(cog).toBeVisible({ timeout: 5_000 });
  timeline.markStep('cog-visible');

  const newPagePromise = ext.context.waitForEvent('page', { timeout: 5_000 });
  await cog.click();
  timeline.markStep('cog-clicked');

  const opened = await newPagePromise;
  await opened.waitForLoadState('domcontentloaded');
  expect(opened.url()).toMatch(
    new RegExp(`^chrome-extension://${ext.extensionId}/src/options/`, 'i'),
  );
  timeline.markStep('options-open');
});
