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
import { expectSameWidth } from '../_harness';

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
  // A check item keeps the check's place while off, so its label keeps one width (R63).
  const more = page.locator('[data-ega-header-more]');
  const item = page.getByRole('menuitemcheckbox', { name: 'Show bookmarked only' });
  const empty = page.locator('[data-ega-empty-state]');
  await more.click();
  await expectSameWidth(
    item.locator('.sp-menu-label'),
    async () => {
      await item.click();
      await expect(empty).toContainText('No bookmarked messages');
      await more.click();
      await expect(item).toHaveAttribute('aria-checked', 'true');
    },
    'Show bookmarked only checked',
  );
  await page.keyboard.press('Escape');
  await empty.getByRole('button', { name: 'Show all messages' }).click();
  await expect(page.locator('[data-ega-user-turn]')).toHaveCount(1);

  // A message keeps Bookmark in its own More menu, like a reply.
  const message = page.locator('[data-ega-user-turn]').first();
  await message.hover();
  await message.locator('[data-ega-action="more"]').click();
  const messageItem = page.getByRole('menuitemcheckbox', { name: 'Bookmark', exact: true });
  await expectSameWidth(
    messageItem.locator('.sp-menu-label'),
    async () => {
      await messageItem.click();
      await message.hover();
      await message.locator('[data-ega-action="more"]').click();
      await expect(messageItem).toHaveAttribute('aria-checked', 'true');
    },
    'message Bookmark checked',
  );
  await page.keyboard.press('Escape');

  await more.click();
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

  // The bookmark belongs to the pair: set on the message, the reply says so and its More menu shows it checked.
  const reply = page.locator('[data-ega-reply]').first();
  await expect(reply.locator('[data-ega-reply-meta]')).toContainText('Bookmarked');
  const menu = await openReplyMenu(page, 'more', reply);
  const replyItem = menu.getByRole('menuitemcheckbox', { name: 'Bookmark', exact: true });
  await expect(replyItem).toHaveAttribute('aria-checked', 'true');
  // Unchecking it on the reply clears the pair, so the message's menu shows it unchecked too.
  await expectSameWidth(
    replyItem.locator('.sp-menu-label'),
    async () => {
      await replyItem.click();
      await expect(reply.locator('[data-ega-reply-meta]')).not.toContainText('Bookmarked');
      await openReplyMenu(page, 'more', reply);
      await expect(replyItem).toHaveAttribute('aria-checked', 'false');
    },
    'reply Bookmark unchecked',
  );
  await page.keyboard.press('Escape');
  await message.hover();
  await message.locator('[data-ega-action="more"]').click();
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Bookmark', exact: true }),
  ).toHaveAttribute('aria-checked', 'false');
});
