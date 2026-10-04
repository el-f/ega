/* coverage: translation.popup.freeform-send-handoff */
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

test('Send to panel writes the handoff slot + opens the sidepanel', async () => {
  const timeline = createTimeline();
  const popup = await ext.context.newPage();
  await popup.addInitScript(() => {
    const g = globalThis as unknown as {
      chrome?: {
        sidePanel?: { open: (opts: { tabId: number }) => Promise<void> };
        tabs?: { query: (q: unknown) => Promise<Array<{ id: number; url: string }>> };
      };
      __ega_sidepanel_calls?: Array<{ tabId: number }>;
    };
    if (g.chrome) {
      const calls: Array<{ tabId: number }> = [];
      g.__ega_sidepanel_calls = calls;
      g.chrome.sidePanel = {
        open: async (opts) => {
          calls.push(opts);
        },
      };
      if (g.chrome.tabs) {
        g.chrome.tabs.query = async () => [{ id: 91, url: 'https://example.com/' }];
      }
    }
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  timeline.markStep('popup-opened');

  await popup.locator('[data-ega-freeform-collapsed]').click();
  const ta = popup.locator('[data-ega-freeform-textarea]');
  await expect(ta).toBeVisible({ timeout: 5_000 });
  await ta.fill('hand me off to the sidepanel');
  timeline.markStep('freeform-filled');

  await popup.getByRole('button', { name: /Send to panel/i }).click();
  timeline.markStep('send-clicked');

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

  // pendingPopupHandoff is keyed by `${ts}-${counter}`, so assert the entry shape, not a key.
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
  const entries = Object.values(
    map as Record<string, { sourceText: string; task: string; tone: string }>,
  );
  expect(entries.length).toBeGreaterThanOrEqual(1);
  const slot = entries[0];
  if (!slot) throw new Error('expected pendingPopupHandoff entry');
  expect(slot.sourceText).toBe('hand me off to the sidepanel');
  expect(slot.task).toBe('translate');
  expect(slot.tone).toBe('neutral');
});
