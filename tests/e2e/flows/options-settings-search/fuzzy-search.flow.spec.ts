/* coverage: options.settings-search.fuzzy-search */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('typing into settings-search narrows results to matching entries', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,');
  const input = page.locator('input[placeholder^="Search settings"]');
  await expect(input).toBeVisible({ timeout: 5_000 });

  await input.fill('temperature');
  timeline.markStep('typed');

  // The suggestions share the list id and start with Temperature, so wait on the results listbox.
  const results = page.getByRole('listbox', { name: 'Settings results' });
  await expect(results).toBeVisible({ timeout: 5_000 });
  const items = results.locator('.slv-item');
  await expect(items.first()).toContainText(/temperature/i, { timeout: 5_000 });
});

test('Changed only with no query lists the changed settings, not the popular ones', async () => {
  await seedSettings(ext.context, ext.extensionId, { confidencePill: false });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,');
  const dialog = page.getByRole('dialog', { name: 'Search settings' });
  await dialog.getByText('Changed only').click();
  await expect(dialog.locator('[data-ega-changed-header]')).toHaveText('Changed settings');
  await expect(dialog.getByText('Show confidence pill')).toBeVisible();
  await expect(dialog.getByText('Creativity (temperature)')).toHaveCount(0);
});

test('Changed only on a fresh install says nothing is changed', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,');
  const dialog = page.getByRole('dialog', { name: 'Search settings' });
  await dialog.getByText('Changed only').click();
  await expect(dialog.locator('[data-ega-no-changes]')).toHaveText(
    'No setting is changed from its default',
  );
});
