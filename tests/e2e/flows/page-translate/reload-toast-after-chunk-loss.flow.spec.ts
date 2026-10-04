/* coverage: vision.page-translate.reload-toast-after-chunk-loss */
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
    streaming: true,
    pageTranslateMode: 'bilingual',
  });
});

test.afterEach(async () => {
  await ext.close();
});

async function requestPageTranslate(): Promise<void> {
  const sw = ext.context.serviceWorkers()[0];
  if (!sw) throw new Error('[e2e] no service worker');
  await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) throw new Error('no tab');
    await chrome.tabs.sendMessage(tabId, { kind: 'page:translateAll' });
  });
}

test('a page-translate that cannot load its code offers Reload page, and the button reloads', async () => {
  const timeline = createTimeline();

  const page = await ext.context.newPage();
  // An extension update deletes the old hashed chunks, so the running content script 404s on the next lazy import.
  await page.route('**/batch-progress-*.js', (route) => route.abort());
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);

  await requestPageTranslate();
  timeline.markStep('translate-all-dispatched');

  const action = page.locator('[data-ega-toast-action]');
  await expect(action).toBeVisible({ timeout: 10_000 });
  await expect(action).toHaveText('Reload page');
  await expect(page.locator('.ega-toast')).toContainText('Reload');
  timeline.markStep('reload-toast-visible');

  const reloaded = page.waitForNavigation({ timeout: 10_000 });
  await action.click();
  await reloaded;
  timeline.markStep('page-reloaded');

  // A fresh document means a fresh content script — the toast is gone with it.
  await expect(page.locator('[data-ega-toast-action]')).toHaveCount(0);
});
