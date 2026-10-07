/* coverage: sidepanel.header.delete-conversation-undo */
import { test, expect, type Page } from '@playwright/test';
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
const OLDER = 'https://example.com#k1older1';

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

/** The older conversation as stored: its index row's size and the turns left in its blob. */
async function stored(sp: Page): Promise<{ bytes: number | null; turns: number | null }> {
  return sp.evaluate(async (id) => {
    const r = await chrome.storage.local.get(['ega:conv:index', `ega:conv:t:${id}`]);
    const idx = r['ega:conv:index'] as { threads: { origin: string; bytes: number }[] } | undefined;
    const blob = r[`ega:conv:t:${id}`] as { turns: unknown[] } | undefined;
    return {
      bytes: idx?.threads.find((t) => t.origin === id)?.bytes ?? null,
      turns: blob ? blob.turns.length : null,
    };
  }, OLDER);
}

test('a deleted conversation can be brought back for 8 seconds, then it is gone', async () => {
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
      id: OLDER,
      updatedAt: now - 60 * MIN,
      turns: [user('b1', 'older chat', now - 60 * MIN), reply('b2', 'b1', now - 60 * MIN)],
    },
  ]);
  await sp.reload();
  await expect(sp.locator('[data-ega-user-turn]')).toContainText('newest chat', {
    timeout: 5_000,
  });

  await sp.locator('[data-ega-header-site]').click();
  const list = sp.locator('[data-ega-conversations]');
  const row = list.locator(`[data-ega-conv-row="${OLDER}"]`);
  await row.locator('[data-ega-conv-delete]').click();
  // The row turns into its Undo line at once, and focus waits on Undo.
  await expect(row).toContainText('Conversation deleted');
  const undo = row.locator('[data-ega-conv-undo]');
  await expect(undo).toBeFocused();
  // Nothing is removed from storage while Undo is on screen.
  expect((await stored(sp)).turns).toBe(2);
  timeline.markStep('row-deleted');

  await undo.click();
  await expect(row.locator('[data-ega-conv-title]')).toHaveText('older chat');
  await expect(row.locator('[data-ega-conv-open]')).toBeFocused();
  timeline.markStep('undo-restored');

  // Left alone, the row goes after 8 seconds; the store keeps an emptied row so no window can save the turns back.
  await row.locator('[data-ega-conv-delete]').click();
  await expect(row).toHaveCount(0, { timeout: 12_000 });
  await expect
    .poll(async () => await stored(sp), { timeout: 5_000 })
    .toEqual({ bytes: 2, turns: 0 });
  // A list opened again does not show it.
  await sp.keyboard.press('Escape');
  await sp.locator('[data-ega-header-site]').click();
  await expect(list.locator('[data-ega-conv-row]')).toHaveCount(1);
  // The conversation on screen was never touched.
  await expect(sp.locator('[data-ega-user-turn]')).toContainText('newest chat');
  timeline.markStep('deleted-for-good');
});
