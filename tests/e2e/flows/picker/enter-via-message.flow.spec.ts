/* coverage: vision.picker.enter-via-message */
import { test, expect } from '@playwright/test';
import {
  egaTest,
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
    pickerEnabled: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('picker:enter message mounts the picker overlay', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);
  timeline.markStep('page-ready');

  // Send from the SW, not the tab: chrome.runtime.sendMessage inside a content script is a no-op.
  const sw = ext.context.serviceWorkers()[0];
  if (!sw) throw new Error('no service worker');
  await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) throw new Error('no tab');
    await chrome.tabs.sendMessage(tabId, { kind: 'picker:enter' });
  });
  timeline.markStep('picker-enter-sent');

  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false, { timeout: 5_000 })
    .toBe(true);
});
