/* coverage: translation.popup.translate-clipboard */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

// The popup never renders the translation — the sidepanel drains the handoff on mount.

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

test('Clipboard tile writes the handoff slot + opens the sidepanel', async () => {
  const timeline = createTimeline();
  const popup = await ext.context.newPage();
  // Without a context-level grant, navigator.clipboard.readText rejects in the popup page.
  await ext.context.grantPermissions(['clipboard-read', 'clipboard-write']);
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
      g.chrome.tabs.query = async () => [{ id: 53, url: 'https://example.com/' }];
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

  // The handoff lands in storage.session before sidePanel.open returns.
  const stored = await popup.evaluate(
    async () =>
      await new Promise<unknown>((resolve) =>
        chrome.storage.session.get('ega.pendingPopupHandoff', (out) => resolve(out)),
      ),
  );
  expect(stored).not.toBeNull();
  // The slot holds a map keyed by id, drained in insertion order.
  const slot = (stored as Record<string, Record<string, { sourceText: string }> | undefined>)[
    'ega.pendingPopupHandoff'
  ];
  const entries = Object.values(slot ?? {});
  expect(entries[0]?.sourceText).toBe('hola mundo');
});
