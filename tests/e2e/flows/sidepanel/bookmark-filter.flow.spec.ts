/* coverage: translation.sidepanel.bookmark-filter */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  openReplyMenu,
  seedSettings,
  sendFromPanel,
  type ExtensionHandle,
} from '../../helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'sk-test' });
});

test.afterEach(async () => {
  await ext.close();
});

test('the header More menu turns the bookmark filter on and Show all turns it off', async () => {
  mockAnthropic(ext.context, { translation: 'Welcome.' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await sendFromPanel(page, 'marhaba sadiqi');
  await expect(page.locator('.ega-answer').first()).toContainText('Welcome', {
    timeout: 10_000,
  });

  // With nothing bookmarked the filter says so and offers the way back.
  await page.locator('[data-ega-header-more]').click();
  await page.getByRole('menuitemcheckbox', { name: 'Show bookmarked only' }).click();
  const empty = page.locator('[data-ega-empty-state]');
  await expect(empty).toContainText('No bookmarked messages');
  await empty.getByRole('button', { name: 'Show all messages' }).click();
  await expect(page.locator('[data-ega-user-turn]')).toHaveCount(1);

  // A message keeps Bookmark in its own More menu, like a reply.
  const message = page.locator('[data-ega-user-turn]').first();
  await message.hover();
  await message.locator('[data-ega-action="more"]').click();
  await page.getByRole('menuitemcheckbox', { name: 'Bookmark', exact: true }).click();

  const more = page.locator('[data-ega-header-more]');
  await more.click();
  const item = page.getByRole('menuitemcheckbox', { name: 'Show bookmarked only' });
  await expect(item).toHaveAttribute('aria-checked', 'false');
  await item.click();

  await expect(page.locator('.sp-search-count')).toHaveText('1 bookmarked');
  const showAll = page.locator('[data-ega-bookmark-clear]');
  await expect(showAll).toHaveText('Show all');
  await showAll.click();
  await expect(showAll).toBeHidden();
  await expect(page.locator('[data-ega-user-turn]')).toHaveCount(1);

  await more.click();
  await expect(item).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');

  // A bookmarked reply says so in its meta line, and its More menu shows the item checked.
  const reply = page.locator('[data-ega-reply]').first();
  const menu = await openReplyMenu(page, 'more', reply);
  await menu.getByRole('menuitemcheckbox', { name: 'Bookmark', exact: true }).click();
  await expect(reply.locator('[data-ega-reply-meta]')).toContainText('Bookmarked');
  await openReplyMenu(page, 'more', reply);
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Bookmark', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
});
