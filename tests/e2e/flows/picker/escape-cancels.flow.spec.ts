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
  const overlay = page.locator('[data-ega-picker-wrap]');
  await expect(overlay).toHaveCount(1);
  timeline.markStep('picker-entered');

  // ? is the keyboard way into the bar: Keys takes focus and shows the key list.
  await page.keyboard.press('?');
  const keyList = page.locator('#ega-picker-keys-pick');
  await expect(keyList).toBeVisible();
  expect(
    await page.evaluate(() =>
      document
        .getElementById('ega-shadow-host')
        ?.shadowRoot?.activeElement?.hasAttribute('data-ega-picker-keys'),
    ),
  ).toBe(true);
  // The first Esc closes only the key list; the mode stays.
  await page.keyboard.press('Escape');
  await expect(keyList).toBeHidden();
  await expect(overlay).toHaveCount(1);
  timeline.markStep('key-list-closed');

  await page.keyboard.press('Escape');
  timeline.markStep('escape-pressed');

  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? true, { timeout: 3_000 })
    .toBe(false);
  await expect(overlay).toHaveCount(0);

  // No tooltip mounted, no backend hit.
  const tooltipCount = (await egaTest<number>(page, 'tooltipCount')) ?? 0;
  expect(tooltipCount).toBe(0);
  expect(mock.calls()).toBe(0);
});
