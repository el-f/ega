import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';
import { assertStaysStable } from './flows/_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    pickerEnabled: true,
    pickerShortcut: 'Ctrl+Shift+E',
    contextEnabled: false,
    shortcut: 'Ctrl+Shift+L',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Ctrl+Shift+E enters picker mode, clicking an element fires a translate', async () => {
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');

  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false, { timeout: 3_000 })
    .toBe(true);

  // Click the pick-me paragraph. The picker intercepts at capture phase so
  // navigation / link-follow never happens.
  await page.locator('#pick-me').click();

  // Tooltip opens with the translation result.
  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 10_000 })
    .toContain('Welcome');

  // Picker is no longer active (mode exited on pick).
  const stillActive = await egaTest<boolean>(page, 'pickerIsActive');
  expect(stillActive).toBe(false);
});

test('Esc cancels picker mode without firing a translate', async () => {
  const mock = mockAnthropic(ext.context, { translation: 'unused' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');
  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false, { timeout: 3_000 })
    .toBe(true);

  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false, { timeout: 3_000 })
    .toBe(false);

  // No tooltip opened, no backend call.
  const count = (await egaTest<number>(page, 'tooltipCount')) ?? 0;
  expect(count).toBe(0);
  expect(mock.calls()).toBe(0);
});

test('pickerEnabled=false makes the hotkey a no-op', async () => {
  await seedSettings(ext.context, ext.extensionId, { pickerEnabled: false });
  mockAnthropic(ext.context);
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');

  // Sample across a window: one read after a fixed sleep would miss a picker that mounts late.
  await assertStaysStable(
    async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false,
    false,
    {
      windowMs: 1_500,
      message: 'pickerEnabled=false must keep the hotkey a no-op',
    },
  );
});

test('clicking a sensitive input in picker mode does not capture', async () => {
  const mock = mockAnthropic(ext.context);
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');
  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false, { timeout: 3_000 })
    .toBe(true);

  await page.locator('#pw').click();

  // Nothing-happened has no DOM signal, so sample the whole window instead of one late read.
  await assertStaysStable(
    async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false,
    true,
    {
      windowMs: 1_500,
      message: 'a sensitive click must be discarded without leaving picker mode',
    },
  );

  // No backend hit.
  expect(mock.calls()).toBe(0);

  // Cleanup: cancel the picker.
  await page.keyboard.press('Escape');
});
