/* coverage: integration.popup-sidepanel-handoff.handoff-slot-survives-popup-close */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  type ExtensionHandle,
} from '../../../helpers';
import { createTimeline } from '../../_harness';

// The slot lives in chrome.storage.session, which is process-wide, so closing the popup keeps it.

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

test('handoff entry persists across popup close; cold-start sidepanel drains it', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Ola mundo' });

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
        g.chrome.tabs.query = async () => [{ id: 95, url: 'https://example.com/' }];
      }
    }
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await popup.locator('[data-ega-freeform-collapsed]').click();
  await popup.locator('[data-ega-freeform-textarea]').fill('hello in portuguese');
  await popup.getByRole('button', { name: /Open in side panel/i }).click();

  // The entry must land before the popup closes, else the test proves nothing.
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
  timeline.markStep('handoff-written');

  await popup.close();
  timeline.markStep('popup-closed');

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp.locator('.ega-user-turn').first()).toContainText('hello in portuguese', {
    timeout: 10_000,
  });
  timeline.markStep('cold-seeded');
});
