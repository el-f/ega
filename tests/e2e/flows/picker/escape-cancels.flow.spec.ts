/* coverage: vision.picker.escape-cancels */
import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
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
    pickerShortcut: 'Ctrl+Shift+E',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Esc cancels picker mode without firing a translate', async () => {
  const timeline = createTimeline();
  const mock = mockAnthropic(ext.context, { translation: 'unused' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');
  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false, { timeout: 3_000 })
    .toBe(true);
  timeline.markStep('picker-entered');

  await page.keyboard.press('Escape');
  timeline.markStep('escape-pressed');

  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? true, { timeout: 3_000 })
    .toBe(false);

  // No tooltip mounted, no backend hit.
  const tooltipCount = (await egaTest<number>(page, 'tooltipCount')) ?? 0;
  expect(tooltipCount).toBe(0);
  expect(mock.calls()).toBe(0);
});
