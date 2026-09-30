/* coverage: vision.picker.disabled-no-op */
import { test } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { assertStaysStable, createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    pickerEnabled: false,
    pickerShortcut: 'Ctrl+Shift+E',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('picker:enter is a no-op when pickerEnabled=false', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);

  const sw = ext.context.serviceWorkers()[0];
  if (!sw) throw new Error('no service worker');
  await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) throw new Error('no tab');
    await chrome.tabs.sendMessage(tabId, { kind: 'picker:enter' });
  });
  timeline.markStep('picker-enter-sent');

  // Negative assertion: the overlay must never mount. Sample across a
  // settled window and fail the instant the picker reports active.
  await assertStaysStable(
    async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false,
    false,
    { windowMs: 600, message: 'picker must stay inactive when pickerEnabled=false' },
  );
});

test('pickerEnabled=false makes the hotkey a no-op', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');

  await assertStaysStable(
    async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false,
    false,
    { windowMs: 1_500, message: 'pickerEnabled=false must keep the hotkey a no-op' },
  );
});
