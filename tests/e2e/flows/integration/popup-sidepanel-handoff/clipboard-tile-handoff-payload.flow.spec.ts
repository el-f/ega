/* coverage: integration.popup-sidepanel-handoff.clipboard-tile-handoff-payload */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../../helpers';
import { createTimeline } from '../../_harness';

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

test('clipboard tile writes handoff entry into storage.session map + opens sidepanel', async () => {
  const timeline = createTimeline();
  await ext.context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const popup = await ext.context.newPage();
  await popup.addInitScript(() => {
    const g = globalThis as unknown as {
      chrome?: {
        sidePanel?: { open: (opts: { tabId: number }) => Promise<void> };
        tabs?: { query: (q: unknown) => Promise<Array<{ id: number; url: string }>> };
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
      g.chrome.tabs.query = async () => [{ id: 71, url: 'https://example.com/' }];
    }
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await popup.evaluate(async () => {
    await navigator.clipboard.writeText('hola mundo');
  });
  timeline.markStep('clipboard-seeded');

  // The extension's clipboardRead is optional; headless cannot accept Chrome's grant dialog.
  await popup.evaluate(() => {
    chrome.permissions.request = (async () => true) as typeof chrome.permissions.request;
  });
  await popup.getByRole('button', { name: 'Translate clipboard contents' }).click();
  timeline.markStep('clipboard-clicked');

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

  // The map is keyed by `${ts}-${counter}`, so assert the entry shape, not a known key.
  const map = await popup.evaluate(
    async () =>
      await new Promise<Record<string, unknown> | null>((resolve) =>
        chrome.storage.session.get('ega.pendingPopupHandoff', (out) => {
          const m = (out as Record<string, unknown>)['ega.pendingPopupHandoff'];
          resolve((m as Record<string, unknown> | undefined) ?? null);
        }),
      ),
  );
  expect(map).not.toBeNull();
  const entries = Object.values(map as Record<string, { sourceText?: string }>);
  expect(entries.length).toBeGreaterThanOrEqual(1);
  expect(entries[0]?.sourceText).toBe('hola mundo');
  timeline.markStep('handoff-asserted');
});
