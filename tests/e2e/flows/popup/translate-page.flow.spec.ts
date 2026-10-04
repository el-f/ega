/* coverage: translation.popup.translate-page */
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

test('"Translate this page" sends page:translateAll to the resolved content tab', async () => {
  const timeline = createTimeline();
  const popup = await ext.context.newPage();
  await popup.addInitScript(() => {
    const g = globalThis as unknown as {
      chrome?: {
        tabs?: {
          query: (q: unknown) => Promise<Array<{ id: number; url: string }>>;
          sendMessage: (tabId: number, msg: { kind: string; lang?: string }) => Promise<unknown>;
        };
      };
      __ega_tabs_sent?: Array<{ tabId: number; kind: string; lang?: string }>;
    };
    if (!g.chrome?.tabs) return;
    const sent: Array<{ tabId: number; kind: string; lang?: string }> = [];
    g.__ega_tabs_sent = sent;
    g.chrome.tabs.query = async () => [{ id: 41, url: 'https://example.com/' }];
    g.chrome.tabs.sendMessage = async (tabId, msg) => {
      const entry: { tabId: number; kind: string; lang?: string } = {
        tabId,
        kind: msg.kind,
      };
      if (typeof msg.lang === 'string') entry.lang = msg.lang;
      sent.push(entry);
      return { ok: true };
    };
    // translatePage() calls window.close() after dispatch — neuter it so the page survives.
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  timeline.markStep('popup-opened');

  await popup.getByRole('button', { name: 'Translate this page' }).click();
  timeline.markStep('page-translate-clicked');

  await expect
    .poll(
      async () =>
        await popup.evaluate(() => {
          const sent =
            (
              globalThis as unknown as {
                __ega_tabs_sent?: Array<{ tabId: number; kind: string; lang?: string }>;
              }
            ).__ega_tabs_sent ?? [];
          return sent.find((m) => m.kind === 'page:translateAll') ?? null;
        }),
      { timeout: 5_000 },
    )
    .not.toBeNull();

  const dispatched = await popup.evaluate(
    () =>
      (
        globalThis as unknown as {
          __ega_tabs_sent?: Array<{ tabId: number; kind: string; lang?: string }>;
        }
      ).__ega_tabs_sent ?? [],
  );
  const pt = dispatched.find((m) => m.kind === 'page:translateAll');
  expect(pt?.tabId).toBe(41);
  // No lang assertion: `page:translateAll` carries none — the content script reads settings.
});
