/* coverage: integration.popup-sidepanel-handoff.handoff-slot-cleared-after-read */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  suppressSidePanelOpen,
  type ExtensionHandle,
} from '../../../helpers';
import { createTimeline } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await suppressSidePanelOpen(ext.context, ext.extensionId);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('handoff slot is removed after sidepanel drains; second open re-uses nothing', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Ciao' });

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
        g.chrome.tabs.query = async () => [{ id: 85, url: 'https://example.com/' }];
      }
    }
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await popup.locator('[data-ega-freeform-collapsed]').click();
  await popup.locator('[data-ega-freeform-textarea]').fill('first turn');
  await popup.getByRole('button', { name: /Send to panel/i }).click();
  timeline.markStep('first-send');

  const sp1 = await ext.context.newPage();
  await sp1.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp1.locator('.ega-user-turn').first()).toContainText('first turn', {
    timeout: 10_000,
  });
  timeline.markStep('drained');

  const slot = await sp1.evaluate(
    async () =>
      await new Promise<unknown>((resolve) =>
        chrome.storage.session.get('ega.pendingPopupHandoff', (out) => {
          const m = (out as Record<string, unknown>)['ega.pendingPopupHandoff'];
          resolve(m ?? null);
        }),
      ),
  );
  expect(slot).toBeNull();

  // Persist runs on a 400ms debounce and the pagehide flush is fire-and-forget.
  await expect
    .poll(
      async () =>
        await sp1.evaluate(async () => {
          const all = await chrome.storage.local.get(null);
          return Object.entries(all)
            .filter(([k]) => k.startsWith('ega:conv:t:'))
            .some(([, v]) => ((v as { turns?: unknown[] }).turns ?? []).length > 0);
        }),
      { timeout: 5_000 },
    )
    .toBe(true);

  await sp1.close();
  await popup.close();

  // The conversation persists per origin, so exactly one turn proves the cleared slot was not re-read.
  const sp2 = await ext.context.newPage();
  await sp2.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp2.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await expect(sp2.locator('.ega-user-turn')).toHaveCount(1);
  timeline.markStep('clean-mount');
});
