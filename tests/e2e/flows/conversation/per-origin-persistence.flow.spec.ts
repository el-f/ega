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

test('conversation persists across panel reload and clears on new conversation', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Bonjour le monde.' });

  const panelUrl = `chrome-extension://${ext.extensionId}/src/sidepanel/index.html`;
  let panel = await ext.context.newPage();
  await panel.goto(panelUrl);

  await panel.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await panel.locator('#sp-text').fill('marhaba');
  await panel.getByRole('button', { name: /^Translate$/ }).click();
  timeline.markStep('send-clicked');

  await expect(panel.locator('.ega-assistant-body').first()).toContainText('Bonjour le monde.', {
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
  const clearedIds = storedThread.turns.map((t) => t.id).sort();
  timeline.markStep('storage-verified');

  await panel.close();
  panel = await ext.context.newPage();
  await panel.goto(panelUrl);
  await panel.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await expect(panel.locator('.ega-user-turn')).toHaveCount(1, { timeout: 5_000 });
  await expect(panel.locator('.ega-user-text').first()).toHaveText('marhaba');
  await expect(panel.locator('.ega-assistant-body').first()).toContainText('Bonjour le monde.');
  timeline.markStep('turn-restored-after-reload');

  // A second panel re-reads what the first one writes, so the clear must reach it too.
  const secondPanel = await ext.context.newPage();
  await secondPanel.goto(panelUrl);
  await secondPanel.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await expect(secondPanel.locator('.ega-user-turn')).toHaveCount(1, { timeout: 5_000 });
  timeline.markStep('second-panel-loaded');

  const newConvBtn = panel.locator('[data-ega-new-conversation]');
  await expect(newConvBtn).toBeVisible();
  await newConvBtn.click();

  const confirmBtn = panel.getByRole('button', { name: 'Clear & start new' });
  await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
  await confirmBtn.click();
  timeline.markStep('new-conversation-confirmed');

  await expect(panel.locator('.ega-user-turn')).toHaveCount(0, { timeout: 5_000 });
  await expect(panel.locator('.ega-assistant-turn')).toHaveCount(0);

  // Removing the key would drop the tombstones with it, so clear writes an empty thread that keeps them.
  const afterClear = await readThread(ext);
  expect(afterClear, 'thread row should survive the clear').not.toBeNull();
  const cleared = afterClear as StoredThreadRow;
  expect(cleared.turns, 'cleared thread should hold no turns').toEqual([]);
  expect(
    (cleared.tombstones ?? []).map((t) => t.id).sort(),
    'both cleared turns should be tombstoned',
  ).toEqual(clearedIds);
  timeline.markStep('storage-cleared');

  // The clear reaches the second panel through storage.
  await expect(secondPanel.locator('.ega-user-turn')).toHaveCount(0, { timeout: 5_000 });
  await expect(secondPanel.locator('.ega-assistant-turn')).toHaveCount(0);
});
