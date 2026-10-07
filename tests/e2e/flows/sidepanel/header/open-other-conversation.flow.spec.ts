/* coverage: sidepanel.header.open-other-conversation */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../../helpers';
import {
  FOLLOW_FIXTURE_SCRIPT,
  openExampleTab,
  reply,
  seedConversations,
  user,
} from '../../../sidepanel-audit';
import { createTimeline } from '../../_harness';

let ext: ExtensionHandle;

const MIN = 60_000;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    contextEnabled: false,
  });
  await ext.context.addInitScript(FOLLOW_FIXTURE_SCRIPT);
  await openExampleTab(ext.context);
});

test.afterEach(async () => {
  await ext.close();
});

test('the site title lists every conversation, and picking one opens it', async () => {
  const timeline = createTimeline();
  const now = Date.now();
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await seedConversations(sp, [
    {
      id: 'https://example.com',
      updatedAt: now - 5 * MIN,
      turns: [user('a1', 'newest chat', now - 5 * MIN), reply('a2', 'a1', now - 5 * MIN)],
    },
    {
      id: 'https://example.com#k1older1',
      updatedAt: now - 60 * MIN,
      turns: [
        user('b1', 'older chat', now - 60 * MIN),
        reply('b2', 'b1', now - 60 * MIN, { content: 'Older answer.' }),
      ],
    },
    {
      id: 'https://wikipedia.org',
      updatedAt: now - 120 * MIN,
      turns: [
        user('c1', 'wiki chat', now - 120 * MIN),
        reply('c2', 'c1', now - 120 * MIN, { content: 'Wiki answer.' }),
      ],
    },
  ]);
  await sp.reload();

  // The panel opens the site's newest conversation.
  const site = sp.locator('[data-ega-header-site]');
  await expect(site).toHaveText('example.com', { timeout: 5_000 });
  await expect(sp.locator('[data-ega-user-turn]')).toContainText('newest chat', {
    timeout: 5_000,
  });
  timeline.markStep('newest-open');

  await site.click();
  const list = sp.locator('[data-ega-conversations]');
  await expect(list).toBeVisible();
  await expect(list.getByRole('heading', { name: 'This site' })).toBeVisible();
  await expect(list.getByRole('heading', { name: 'Other sites' })).toBeVisible();
  const rows = list.locator('[data-ega-conv-title]');
  await expect(rows).toHaveText(['newest chat', 'older chat', 'wiki chat']);
  // The open conversation is marked in its name, not only by the check glyph.
  await expect(list.locator('[data-ega-conv-open][aria-current="true"]')).toContainText(
    'newest chat',
  );
  timeline.markStep('list-open');

  await list.locator('[data-ega-conv-open]', { hasText: 'older chat' }).click();
  await expect(list).toHaveCount(0);
  await expect(sp.locator('[data-ega-user-turn]')).toContainText('older chat');
  await expect(sp.locator('.ega-answer')).toContainText('Older answer.');
  await expect(sp.locator('#sp-text')).toBeFocused();
  // Times live in a separator over the first message, not on every message.
  await expect(sp.locator('[data-ega-day-separator]')).toHaveCount(1);
  timeline.markStep('older-open');

  // A conversation from another site opens too; the header names its site.
  await site.click();
  await sp.locator('[data-ega-conv-open]', { hasText: 'wiki chat' }).click();
  await expect(site).toHaveText('wikipedia.org');
  await expect(sp.locator('.ega-answer')).toContainText('Wiki answer.');
  timeline.markStep('other-site-open');

  // Opening counts as use: the older example.com conversation is the one the site comes back to.
  await site.click();
  await sp.locator('[data-ega-conv-open]', { hasText: 'older chat' }).click();
  await expect(sp.locator('.ega-answer')).toContainText('Older answer.');
  await sp.reload();
  await expect(sp.locator('[data-ega-user-turn]')).toContainText('older chat', {
    timeout: 5_000,
  });
  timeline.markStep('reopen-remembers');
});
