/* coverage: vision.picker.click-selects-translates */
import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline, waitForVisibleText } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    pickerEnabled: true,
    pickerShortcut: 'Ctrl+Shift+E',
    contextEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('click on a picker target translates and exits picker mode', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');
  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false, { timeout: 3_000 })
    .toBe(true);
  timeline.markStep('picker-entered');

  await page.locator('#pick-me').click();
  timeline.markStep('element-clicked');

  await waitForVisibleText(page, '.tooltip .body', 'Welcome');
  timeline.markStep('tooltip-visible');

  const stillActive = (await egaTest<boolean>(page, 'pickerIsActive')) ?? true;
  expect(stillActive).toBe(false);
});
