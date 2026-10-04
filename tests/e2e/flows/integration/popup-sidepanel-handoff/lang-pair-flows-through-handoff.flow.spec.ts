/* coverage: integration.popup-sidepanel-handoff.lang-pair-flows-through-handoff */
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

test('source+target lang from popup pickers persist into the handoff payload', async () => {
  const timeline = createTimeline();
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
        g.chrome.tabs.query = async () => [{ id: 27, url: 'https://example.com/' }];
      }
    }
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  timeline.markStep('popup-open');

  await popup.locator('#pop-lang').selectOption('en');
  await expect(popup.locator('#pop-lang')).toHaveValue('en');
  await popup.locator('#pop-target').selectOption('es');
  await expect(popup.locator('#pop-target')).toHaveValue('es');
  timeline.markStep('lang-picked');

  await popup.locator('[data-ega-freeform-collapsed]').click();
  await popup.locator('[data-ega-freeform-textarea]').fill('hello world');
  await popup.getByRole('button', { name: /Open in side panel/i }).click();
  timeline.markStep('send-clicked');

  await expect
    .poll(
      async () =>
        await popup.evaluate(
          async () =>
            await new Promise<{ sourceLang: string; targetLang: string } | null>((resolve) =>
              chrome.storage.session.get('ega.pendingPopupHandoff', (out) => {
                const m = (out as Record<string, unknown>)['ega.pendingPopupHandoff'] as
                  Record<string, { sourceLang: string; targetLang: string }> | undefined;
                if (!m) return resolve(null);
                const entries = Object.values(m);
                resolve(entries[0] ?? null);
              }),
            ),
        ),
      { timeout: 5_000 },
    )
    .toMatchObject({ sourceLang: 'en', targetLang: 'es' });
});
