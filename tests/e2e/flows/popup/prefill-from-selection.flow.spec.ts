/* coverage: translation.popup.prefill-from-selection */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
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

test('popup pre-fills the freeform-expand textarea from active-tab selection', async () => {
  const timeline = createTimeline();

  const contentPage = await ext.context.newPage();
  await contentPage.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(contentPage);
  timeline.markStep('content-tab-ready');

  const popup = await ext.context.newPage();
  await popup.addInitScript(() => {
    const g = globalThis as unknown as {
      chrome?: {
        tabs?: {
          query: (q: unknown) => Promise<Array<{ id: number; url: string }>>;
          sendMessage: (tabId: number, msg: { kind: string }) => Promise<unknown>;
        };
      };
    };
    if (!g.chrome?.tabs) return;
    g.chrome.tabs.query = async () => [{ id: 9, url: 'https://example.com/' }];
    g.chrome.tabs.sendMessage = async (_tabId, msg) => {
      if (msg.kind === 'ega:get-selection') return { text: 'ahlan w sahlan' };
      return { ok: true };
    };
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  timeline.markStep('popup-opened');

  const textarea = popup.locator('[data-ega-freeform-textarea]');
  await expect(textarea).toBeVisible({ timeout: 5_000 });
  await expect(textarea).toHaveValue('ahlan w sahlan', { timeout: 5_000 });
  timeline.markStep('prefill-visible');
});
