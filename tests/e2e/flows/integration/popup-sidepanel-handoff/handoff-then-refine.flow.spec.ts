/* coverage: integration.popup-sidepanel-handoff.handoff-then-refine */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  type ExtensionHandle,
  openReplyMenu,
} from '../../../helpers';
import { createTimeline } from '../../_harness';

// Refine only fires when seedDeliveredTurn records lastDispatch; a null there spawns no variant.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('handoff seeds sidepanel; a Refine preset on the seeded turn adds a version', async () => {
  const timeline = createTimeline();
  const route = mockAnthropic(ext.context, { translation: 'Bonjour le monde' });

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
        g.chrome.tabs.query = async () => [{ id: 91, url: 'https://example.com/' }];
      }
    }
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await popup.locator('[data-ega-freeform-textarea]').fill('translate hello to french');
  await popup.getByRole('button', { name: 'Translate', exact: true }).click();
  timeline.markStep('send-clicked');

  // The slot must land before the sidepanel mounts, or the drain finds nothing.
  await expect
    .poll(
      async () =>
        await popup.evaluate(
          async () =>
            await new Promise<number>((resolve) =>
              chrome.storage.session.get('ega.pendingPopupHandoff', (out) => {
                const m = (out as Record<string, unknown>)['ega.pendingPopupHandoff'];
                resolve(m ? Object.keys(m).length : 0);
              }),
            ),
        ),
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(1);

  await popup.close();

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp.locator('.ega-user-turn').first()).toContainText('translate hello to french', {
    timeout: 10_000,
  });
  await expect(sp.locator('.ega-answer').first()).toContainText('Bonjour', {
    timeout: 10_000,
  });
  timeline.markStep('sidepanel-seeded');

  const menu = await openReplyMenu(sp, 'refine');
  const shorter = menu.locator('[data-ega-refine-preset="shorter"]');
  await expect(shorter).toBeVisible({ timeout: 5_000 });
  timeline.markStep('menu-open');

  await shorter.click();
  timeline.markStep('preset-picked');

  await expect(sp.locator('[data-ega-variant-nav]')).toBeVisible({ timeout: 10_000 });
  await expect(sp.locator('.ega-user-turn')).toHaveCount(1);
  await expect(sp.locator('[data-ega-reply]')).toHaveCount(1);
  timeline.markStep('variant-spawned');

  await expect
    .poll(() => route.lastRequestBody(), { timeout: 5_000 })
    .toMatch(/Refinement for this response: Make outputs shorter\./);
  timeline.markStep('wire-payload-asserted');
});
