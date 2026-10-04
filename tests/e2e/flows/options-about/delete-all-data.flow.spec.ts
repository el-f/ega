/* coverage: options.about.delete-all-data */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

const GENERAL_THREAD_KEY = 'ega:conv:t:general';
const CONV_INDEX_KEY = 'ega:conv:index';
// The worker rebuilds the context menus from defaults after the wipe and records that they exist; it holds no user data.
const MENUS_BUILT_KEY = 'ega.menusBuilt';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'sk-ant-sentinel' });
  // Also seed a session cache entry.
  const page = await ext.context.newPage();
  try {
    await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    await page.evaluate(async () => {
      await chrome.storage.session.set({ 'ega.test-session-sentinel': { k: 'v' } });
    });
  } finally {
    await page.close();
  }
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Delete all data clears both storage.local and storage.session after typing DELETE', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-about').click();
  timeline.markStep('about-active');

  await page.getByRole('button', { name: 'Delete all data' }).click();

  const dialog = page.locator('.ega-dialog', { hasText: 'Delete all data' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  const confirmBtn = dialog.getByRole('button', { name: 'Delete all data', exact: true });
  await expect(confirmBtn).toBeDisabled();

  await dialog.locator('#confirm-input').fill('DELETE');
  await expect(confirmBtn).toBeEnabled({ timeout: 2_000 });
  await confirmBtn.click();
  timeline.markStep('confirmed');

  await expect
    .poll(
      async () => {
        const p2 = await ext.context.newPage();
        try {
          await p2.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
          const [localEmpty, sessionEmpty] = await p2.evaluate(async (key) => {
            const local = await chrome.storage.local.get(null);
            const session = await chrome.storage.session.get(null);
            return [Object.keys(local).length === 0, Object.keys(session).every((k) => k === key)];
          }, MENUS_BUILT_KEY);
          return localEmpty && sessionEmpty;
        } finally {
          await p2.close();
        }
      },
      { timeout: 10_000 },
    )
    .toBe(true);
});

test('Delete all data empties an open side panel, and that panel does not write its thread back', async () => {
  const timeline = createTimeline();
  const panelUrl = `chrome-extension://${ext.extensionId}/src/sidepanel/index.html`;

  const seeder = await ext.context.newPage();
  try {
    await seeder.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    await seeder.evaluate(
      async ([threadKey, indexKey]) => {
        const now = Date.now();
        const turns = [
          {
            id: 'purge-u1',
            role: 'user',
            kind: 'translate',
            status: 'idle',
            content: 'text that must not survive',
            createdAt: now,
          },
        ];
        await chrome.storage.local.set({
          [threadKey as string]: { version: 1, origin: 'general', turns, updatedAt: now },
          [indexKey as string]: {
            version: 1,
            threads: [{ origin: 'general', updatedAt: now, bytes: JSON.stringify(turns).length }],
          },
        });
      },
      [GENERAL_THREAD_KEY, CONV_INDEX_KEY],
    );
  } finally {
    await seeder.close();
  }

  const panel = await ext.context.newPage();
  await panel.goto(panelUrl);
  await panel.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await expect(panel.locator('.ega-user-turn')).toHaveCount(1, { timeout: 5_000 });
  timeline.markStep('panel-loaded-thread');

  const options = await ext.context.newPage();
  await options.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await options.locator('#tab-about').click();
  await options.getByRole('button', { name: 'Delete all data' }).click();
  const dialog = options.locator('.ega-dialog', { hasText: 'Delete all data' });
  await dialog.locator('#confirm-input').fill('DELETE');
  await dialog.getByRole('button', { name: 'Delete all data', exact: true }).click();
  timeline.markStep('purge-confirmed');

  await expect(panel.locator('.ega-user-turn')).toHaveCount(0, { timeout: 10_000 });
  timeline.markStep('panel-emptied');

  await panel.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })),
  );
  // Every thread write holds this lock, so getting it waits out any write the pagehide flush started.
  await panel.evaluate(() => navigator.locks.request('ega:conv-store', async () => {}));
  expect(await readStorage(ext.context, ext.extensionId, GENERAL_THREAD_KEY)).toBeNull();
  timeline.markStep('no-write-back');

  await options.close();
  await panel.close();
});
