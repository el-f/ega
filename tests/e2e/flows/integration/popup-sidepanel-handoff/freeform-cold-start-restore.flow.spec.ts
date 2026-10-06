/* coverage: integration.popup-sidepanel-handoff.freeform-cold-start-restore */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  type ExtensionHandle,
} from '../../../helpers';
import { createTimeline } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Open in side panel with cold sidepanel: cold-start drains slot and seeds the conversation', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Bonjour le monde' });

  const popup = await ext.context.newPage();
  await popup.addInitScript(() => {
    const g = globalThis as unknown as {
      chrome?: {
        sidePanel?: { open: (opts: { tabId: number }) => Promise<void> };
        tabs?: { query: (q: unknown) => Promise<Array<{ id: number; url: string }>> };
      };
    };
    if (g.chrome) {
      g.chrome.sidePanel = { open: async () => {} };
      if (g.chrome.tabs) {
        g.chrome.tabs.query = async () => [{ id: 81, url: 'https://example.com/' }];
      }
    }
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  timeline.markStep('popup-open');

  await popup.locator('[data-ega-freeform-textarea]').fill('translate hello to french');
  await popup.getByRole('button', { name: 'Translate', exact: true }).click();
  timeline.markStep('send-clicked');

  // Confirm the handoff is in storage before mounting the sidepanel.
  await expect
    .poll(
      async () =>
        await popup.evaluate(
          async () =>
            await new Promise<number>((resolve) =>
              chrome.storage.session.get('ega.pendingPopupHandoff', (out) => {
                const m = (out as Record<string, unknown>)['ega.pendingPopupHandoff'];
                resolve(m ? Object.keys(m).length : 0);
              }),
            ),
        ),
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(1);

  await popup.close();

  // Cold-start sidepanel — it should drain the handoff on mount.
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp.locator('.ega-user-turn').first()).toContainText('translate hello to french', {
    timeout: 10_000,
  });
  await expect(sp.locator('.ega-answer').first()).toContainText('Bonjour', {
    timeout: 10_000,
  });
  timeline.markStep('sidepanel-seeded');
});
