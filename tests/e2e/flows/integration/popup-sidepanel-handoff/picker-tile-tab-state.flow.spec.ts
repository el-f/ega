/* coverage: integration.popup-sidepanel-handoff.picker-tile-tab-state */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../../helpers';
import { createTimeline } from '../../_harness';

// Despite the folder name, this flow never opens the sidepanel: the popup talks to the content tab.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    pickerEnabled: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('popup pick tile dispatches picker:enter to the resolved content tab', async () => {
  const timeline = createTimeline();
  const popup = await ext.context.newPage();
  await popup.addInitScript(() => {
    const g = globalThis as unknown as {
      chrome?: {
        tabs?: {
          query: (q: unknown) => Promise<Array<{ id: number; url: string }>>;
          sendMessage: (tabId: number, msg: { kind: string }) => Promise<unknown>;
        };
      };
      __ega_tabs_sent?: Array<{ tabId: number; kind: string }>;
    };
    if (!g.chrome?.tabs) return;
    const sent: Array<{ tabId: number; kind: string }> = [];
    g.__ega_tabs_sent = sent;
    g.chrome.tabs.query = async () => [{ id: 47, url: 'https://example.com/' }];
    g.chrome.tabs.sendMessage = async (tabId, msg) => {
      sent.push({ tabId, kind: msg.kind });
      return { ok: true };
    };
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  timeline.markStep('popup-open');

  await popup.getByRole('button', { name: 'Pick element' }).click();
  timeline.markStep('picker-clicked');

  await expect
    .poll(
      async () =>
        await popup.evaluate(() => {
          const sent =
            (
              globalThis as unknown as {
                __ega_tabs_sent?: Array<{ tabId: number; kind: string }>;
              }
            ).__ega_tabs_sent ?? [];
          return sent.find((m) => m.kind === 'picker:enter') ?? null;
        }),
      { timeout: 5_000 },
    )
    .not.toBeNull();

  const dispatched = await popup.evaluate(
    () =>
      (
        globalThis as unknown as {
          __ega_tabs_sent?: Array<{ tabId: number; kind: string }>;
        }
      ).__ega_tabs_sent ?? [],
  );
  expect(dispatched.find((m) => m.kind === 'picker:enter')?.tabId).toBe(47);
});
