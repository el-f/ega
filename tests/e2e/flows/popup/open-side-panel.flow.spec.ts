/* coverage: translation.popup.open-side-panel */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('"Open side panel" button calls chrome.sidePanel.open against the content tab', async () => {
  const timeline = createTimeline();
  const popup = await ext.context.newPage();
  // Stub sidePanel + tabs.query so the controller resolves a fake tab and open() records its args.
  await popup.addInitScript(() => {
    const g = globalThis as unknown as {
      chrome?: {
        sidePanel?: { open: (opts: { tabId: number }) => Promise<void> };
        tabs?: {
          query: (q: unknown) => Promise<Array<{ id: number; url: string }>>;
        };
      };
      __ega_sidepanel_calls?: Array<{ tabId: number }>;
    };
    if (!g.chrome) return;
    const calls: Array<{ tabId: number }> = [];
    g.__ega_sidepanel_calls = calls;
    g.chrome.sidePanel = {
      open: async (opts) => {
        calls.push(opts);
      },
    };
    if (g.chrome.tabs) {
      g.chrome.tabs.query = async () => [{ id: 21, url: 'https://example.com/' }];
    }
    // The controller calls window.close() on success, which would tear this tab down mid-assert.
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  timeline.markStep('popup-opened');

  await popup.locator('[data-ega-popup-tools] button[aria-label="Open side panel"]').click();
  timeline.markStep('sidepanel-clicked');

  await expect
    .poll(
      async () =>
        await popup.evaluate(
          () =>
            (
              (globalThis as unknown as { __ega_sidepanel_calls?: Array<{ tabId: number }> })
                .__ega_sidepanel_calls ?? []
            ).length,
        ),
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(1);

  const calls = await popup.evaluate(
    () =>
      (globalThis as unknown as { __ega_sidepanel_calls?: Array<{ tabId: number }> })
        .__ega_sidepanel_calls ?? [],
  );
  expect(calls[0]?.tabId).toBe(21);
});
