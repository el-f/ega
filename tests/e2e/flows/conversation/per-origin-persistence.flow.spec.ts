/* coverage: translation.conversation.per-origin-persistence */
// Reload variant, not cross-origin: the panel is an extension page, so every open resolves to GENERAL_ORIGIN.
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  readStorage,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

/** Storage key for the GENERAL_ORIGIN thread (djb2 of "general" → base36). */
// Keys carry the origin verbatim — a hash collided two origins onto one thread.
const GENERAL_THREAD_KEY = 'ega:conv:t:general';

interface StoredThreadRow {
  version: number;
  origin: string;
  turns: { id: string }[];
  updatedAt: number;
  tombstones?: { id: string; at: number }[];
}

const readThread = (ext: ExtensionHandle): Promise<StoredThreadRow | null> =>
  readStorage<StoredThreadRow>(ext.context, ext.extensionId, GENERAL_THREAD_KEY);

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('a conversation persists across panel reload, and New keeps it while starting another', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Bonjour le monde.' });

  const panelUrl = `chrome-extension://${ext.extensionId}/src/sidepanel/index.html`;
  let panel = await ext.context.newPage();
  await panel.goto(panelUrl);

  await panel.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await panel.locator('#sp-text').fill('marhaba');
  await panel.locator('#sp-text').press('Enter');
  timeline.markStep('send-clicked');

  await expect(panel.locator('.ega-answer').first()).toContainText('Bonjour le monde.', {
    timeout: 10_000,
  });
  await expect(panel.locator('.ega-cursor')).toHaveCount(0, { timeout: 5_000 });
  timeline.markStep('stream-done');

  // SidePanel.onMount listens for pagehide and flushes to storage there.
  await panel.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })),
  );
  // pagehide starts the write; a fixed delay would race the lock it waits on.
  await expect
    .poll(async () => (await readThread(ext))?.turns.length ?? 0, { timeout: 5_000 })
    .toBe(2);
  timeline.markStep('flush-triggered');

  const stored = await readThread(ext);
  expect(stored, 'thread should be in storage after flush').not.toBeNull();
  const storedThread = stored as StoredThreadRow;
  expect(storedThread.turns.length, 'stored thread should have 2 turns (user + assistant)').toBe(2);
  timeline.markStep('storage-verified');

  await panel.close();
  panel = await ext.context.newPage();
  await panel.goto(panelUrl);
  await panel.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await expect(panel.locator('.ega-user-turn')).toHaveCount(1, { timeout: 5_000 });
  await expect(panel.locator('.ega-user-text').first()).toHaveText('marhaba');
  await expect(panel.locator('.ega-answer').first()).toContainText('Bonjour le monde.');
  timeline.markStep('turn-restored-after-reload');

  // A second panel on the same site shows the same conversation.
  const secondPanel = await ext.context.newPage();
  await secondPanel.goto(panelUrl);
  await secondPanel.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await expect(secondPanel.locator('.ega-user-turn')).toHaveCount(1, { timeout: 5_000 });
  timeline.markStep('second-panel-loaded');

  const newConvBtn = panel.locator('[data-ega-new-conversation]');
  await expect(newConvBtn).toBeVisible();
  await newConvBtn.click();
  timeline.markStep('new-conversation');

  // No confirm, and nothing is cleared: the old conversation stays stored as it was.
  await expect(panel.locator('.ega-user-turn')).toHaveCount(0, { timeout: 5_000 });
  await expect(panel.locator('[data-ega-reply]')).toHaveCount(0);
  expect((await readThread(ext))?.turns.length).toBe(2);
  // A window that is open is never switched under the reader.
  await expect(secondPanel.locator('.ega-user-turn')).toHaveCount(1);
  timeline.markStep('old-conversation-kept');

  // The first message of the new conversation stores it under its own id, beside the old one.
  await panel.locator('#sp-text').fill('salam');
  await panel.locator('#sp-text').press('Enter');
  await expect(panel.locator('.ega-answer').first()).toContainText('Bonjour le monde.', {
    timeout: 10_000,
  });
  await expect
    .poll(
      async () =>
        (
          (await readStorage<{ threads: { origin: string }[] }>(
            ext.context,
            ext.extensionId,
            'ega:conv:index',
          )) ?? { threads: [] }
        ).threads
          .map((t) => t.origin)
          .filter((o) => o === 'general' || o.startsWith('general#')).length,
      { timeout: 5_000 },
    )
    .toBe(2);
  expect((await readThread(ext))?.turns.length).toBe(2);
  timeline.markStep('two-conversations-stored');

  // A reopened panel shows the conversation used last.
  await panel.close();
  panel = await ext.context.newPage();
  await panel.goto(panelUrl);
  await expect(panel.locator('.ega-user-text').first()).toHaveText('salam', { timeout: 5_000 });
});
