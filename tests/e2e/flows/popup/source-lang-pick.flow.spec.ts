/* coverage: translation.popup.source-lang-pick */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

// The popup never translates inline — the picker only drives the handoff payload that seeds the sidepanel turn.

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

test('source picker change persists into the pendingPopupHandoff', async () => {
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
        g.chrome.tabs.query = async () => [{ id: 17, url: 'https://example.com/' }];
      }
    }
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  timeline.markStep('popup-opened');

  const src = popup.locator('#pop-lang');
  await expect(src).toBeVisible({ timeout: 5_000 });
  await src.selectOption('es');
  await expect(src).toHaveValue('es');
  timeline.markStep('source-picked');

  await popup.locator('[data-ega-freeform-collapsed]').click();
  await popup.locator('[data-ega-freeform-textarea]').fill('hola mundo');
  await popup.getByRole('button', { name: /Send to panel/i }).click();
  timeline.markStep('send-clicked');

  // The map is keyed by `${ts}-${counter}`, so match the first value's shape, not a known key.
  await expect
    .poll(
      async () =>
        await popup.evaluate(
          async () =>
            await new Promise<{ sourceText?: string; sourceLang?: string } | null>((resolve) =>
              chrome.storage.session.get('ega.pendingPopupHandoff', (out) => {
                const m = (out as Record<string, unknown>)['ega.pendingPopupHandoff'] as
                  Record<string, { sourceText?: string; sourceLang?: string }> | undefined;
                if (!m) return resolve(null);
                resolve(Object.values(m)[0] ?? null);
              }),
            ),
        ),
      { timeout: 5_000 },
    )
    .toMatchObject({ sourceLang: 'es', sourceText: 'hola mundo' });
});
