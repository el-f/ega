/* coverage: translation.popup.target-lang-pick */
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

test('target picker change persists into the pendingPopupHandoff', async () => {
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
        g.chrome.tabs.query = async () => [{ id: 18, url: 'https://example.com/' }];
      }
    }
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  timeline.markStep('popup-opened');

  const target = popup.locator('#pop-target');
  await expect(target).toBeVisible({ timeout: 5_000 });
  await target.selectOption('fr');
  await expect(target).toHaveValue('fr');
  timeline.markStep('target-picked');

  await popup.locator('[data-ega-freeform-collapsed]').click();
  await popup.locator('[data-ega-freeform-textarea]').fill('hello world');
  await popup.getByRole('button', { name: /Open in side panel/i }).click();
  timeline.markStep('send-clicked');

  // The handoff is a keyed map, so match the first value, not a known key.
  await expect
    .poll(
      async () =>
        await popup.evaluate(
          async () =>
            await new Promise<{ sourceText?: string; targetLang?: string } | null>((resolve) =>
              chrome.storage.session.get('ega.pendingPopupHandoff', (out) => {
                const m = (out as Record<string, unknown>)['ega.pendingPopupHandoff'] as
                  Record<string, { sourceText?: string; targetLang?: string }> | undefined;
                if (!m) return resolve(null);
                resolve(Object.values(m)[0] ?? null);
              }),
            ),
        ),
      { timeout: 5_000 },
    )
    .toMatchObject({ targetLang: 'fr', sourceText: 'hello world' });
});
