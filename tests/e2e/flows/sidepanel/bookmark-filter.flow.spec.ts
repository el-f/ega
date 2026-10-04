/* coverage: translation.sidepanel.bookmark-filter */
import { test, expect } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from '../../helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'sk-test' });
});

test.afterEach(async () => {
  await ext.close();
});

test('the More menu turns the bookmark filter on and Show all turns it off', async () => {
  mockAnthropic(ext.context, { translation: 'Welcome.' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await page.locator('#sp-text').fill('marhaba sadiqi');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  await expect(page.locator('.ega-assistant-body').first()).toContainText('Welcome', {
    timeout: 10_000,
  });
  await page.getByRole('button', { name: 'Bookmark this message' }).first().click();

  const more = page.getByRole('button', { name: 'More actions' });
  await more.click();
  const item = page.getByRole('menuitemcheckbox', { name: 'Show bookmarked only' });
  await expect(item).toHaveAttribute('aria-checked', 'false');
  await item.click();

  await expect(page.locator('.sp-search-count')).toHaveText('1 message bookmarked');
  const showAll = page.locator('[data-ega-bookmark-clear]');
  await expect(showAll).toHaveText('Show all');
  await showAll.click();
  await expect(showAll).toBeHidden();
  await expect(page.locator('.ega-user-turn')).toHaveCount(1);

  await more.click();
  await expect(item).toHaveAttribute('aria-checked', 'false');
});
