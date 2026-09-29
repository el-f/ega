/* example: crossSurfaceFlow — popup → options surface handoff */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { crossSurfaceFlow, createTimeline } from '../_harness';

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

test('popup → options hand-off lands the user on the options shell', async () => {
  const timeline = createTimeline();
  const popupUrl = `chrome-extension://${ext.extensionId}/src/popup/index.html`;

  const { toPage } = await crossSurfaceFlow(ext.context, {
    from: { url: popupUrl },
    action: async (popup) => {
      // chrome.runtime.openOptionsPage() lands as a new tab in this context, not a new window.
      const btn = popup.getByRole('button', { name: /open settings/i });
      await expect(btn).toBeVisible({ timeout: 5_000 });
      timeline.markStep('open-options-visible');
      await btn.click();
      timeline.markStep('open-options-clicked');
    },
    expects: {
      predicate: async (page) => /\/options\//.test(page.url()),
      timeoutMs: 10_000,
    },
  });
  timeline.markStep('options-mounted');

  await expect(toPage.locator('#tab-translate, #tab-backends, #tab-about').first()).toBeVisible({
    timeout: 5_000,
  });
});
