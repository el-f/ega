/* coverage: options.advanced.saved-conversations */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

const GENERAL_THREAD_KEY = 'ega:conv:t:general';
const SITE_THREAD_KEY = 'ega:conv:t:https://example.com';
const CONV_INDEX_KEY = 'ega:conv:index';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Delete empties an open side panel for that thread, and Delete all removes every thread', async () => {
  const timeline = createTimeline();
  const seeder = await ext.context.newPage();
  try {
    await seeder.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    await seeder.evaluate(
      async ([generalKey, siteKey, indexKey]) => {
        const now = Date.now();
        const turns = (id: string, content: string) => [
          { id, role: 'user', kind: 'translate', status: 'idle', content, createdAt: now },
        ];
        const general = turns('g-u1', 'text on a page with no site');
        const site = turns('s-u1', 'text on example.com');
        await chrome.storage.local.set({
          [generalKey as string]: { version: 1, origin: 'general', turns: general, updatedAt: now },
          [siteKey as string]: {
            version: 1,
            origin: 'https://example.com',
            turns: site,
            updatedAt: now - 1000,
          },
          [indexKey as string]: {
            version: 1,
            threads: [
              {
                origin: 'https://example.com',
                updatedAt: now - 1000,
                bytes: JSON.stringify(site).length,
              },
              { origin: 'general', updatedAt: now, bytes: JSON.stringify(general).length },
            ],
          },
        });
      },
      [GENERAL_THREAD_KEY, SITE_THREAD_KEY, CONV_INDEX_KEY],
    );
  } finally {
    await seeder.close();
  }

  const panel = await ext.context.newPage();
  await panel.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await panel.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await expect(panel.locator('.ega-user-turn')).toHaveCount(1, { timeout: 5_000 });
  timeline.markStep('panel-loaded-thread');

  const options = await ext.context.newPage();
  await options.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await options.locator('#tab-advanced').click();
  await options.locator('[data-ega-subtab="data"]').click();
  const card = options.locator('[data-ega-setting="advanced.savedConversations"]');
  await expect(card.getByText('text on a page with no site', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(card.getByText('text on example.com', { exact: true })).toBeVisible();
  // One row per conversation, each with its name line.
  await expect(card.locator('[data-ega-conv-title]')).toHaveCount(2);
  timeline.markStep('list-shown');

  // Legacy rows backfill their first message. Delete hides immediately; Undo keeps the stored thread.
  await card.getByRole('button', { name: /^Delete conversation .*Other pages$/ }).click();
  await expect(card.locator('[data-ega-conv-title]')).toHaveCount(1);
  await expect(panel.locator('.ega-user-turn')).toHaveCount(1);
  await options.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(card.locator('[data-ega-conv-title]')).toHaveCount(2);
  await expect(panel.locator('.ega-user-turn')).toHaveCount(1);
  timeline.markStep('delete-undone');

  await card.getByRole('button', { name: /^Delete conversation .*Other pages$/ }).click();
  // Leaving the options page flushes its deferred delete instead of losing it.
  await options.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  timeline.markStep('delete-flushed');

  await expect(panel.locator('.ega-user-turn')).toHaveCount(0, { timeout: 10_000 });
  await expect(card.getByText('Other pages')).toHaveCount(0);
  timeline.markStep('panel-emptied');

  await panel.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })),
  );
  // Every thread write holds this lock, so getting it waits out any write the pagehide flush started.
  await panel.evaluate(() => navigator.locks.request('ega:conv-store', async () => {}));
  const general = await readStorage<{ turns: unknown[] }>(
    ext.context,
    ext.extensionId,
    GENERAL_THREAD_KEY,
  );
  expect(general?.turns).toEqual([]);
  timeline.markStep('no-write-back');

  await card.locator('[data-ega-conv-delete-all]').click();
  await expect(card.getByText('No saved conversations')).toBeVisible({ timeout: 10_000 });
  expect(await readStorage(ext.context, ext.extensionId, SITE_THREAD_KEY)).not.toBeNull();
  await options.close();
  // Empty tombstones keep an open panel from writing an older conversation back.
  await expect
    .poll(
      async () =>
        (await readStorage<{ turns: unknown[] }>(ext.context, ext.extensionId, SITE_THREAD_KEY))
          ?.turns,
    )
    .toEqual([]);
  timeline.markStep('all-cleared');

  timeline.report();
  await panel.close();
});
