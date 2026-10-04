/* coverage: integration.popup-sidepanel-handoff.freeform-warm-handoff */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  type ExtensionHandle,
} from '../../../helpers';
import { createTimeline } from '../../_harness';

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

test('Send to panel with warm sidepanel: live mount drains slot on storage.onChanged', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Hallo Welt' });

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  timeline.markStep('sidepanel-warm');

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
        g.chrome.tabs.query = async () => [{ id: 84, url: 'https://example.com/' }];
      }
    }
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await popup.locator('[data-ega-freeform-collapsed]').click();
  await popup.locator('[data-ega-freeform-textarea]').fill('hello in german');
  await popup.getByRole('button', { name: /Send to panel/i }).click();
  timeline.markStep('send-clicked');

  // The warm sidepanel picks the turn up without a remount.
  await expect(sp.locator('.ega-user-turn').last()).toContainText('hello in german', {
    timeout: 10_000,
  });
  await expect(sp.locator('.ega-assistant-body').last()).toContainText('Hallo', {
    timeout: 10_000,
  });
  timeline.markStep('warm-drain');
});
