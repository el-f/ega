/* coverage: vision.picker.empty-element-toast */
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

test('click on an empty element exits picker and shows a toast', async () => {
  const timeline = createTimeline();
  const mock = mockAnthropic(ext.context);

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);

  // Decorative wrappers with no text are the real-world case for this branch.
  await page.evaluate(() => {
    const wrap = document.createElement('div');
    wrap.id = 'empty-box';
    wrap.style.cssText = 'width:200px;height:60px;background:#ddd;margin:20px 0;';
    document.body.appendChild(wrap);
  });

  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');
  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false, { timeout: 3_000 })
    .toBe(true);
  timeline.markStep('picker-entered');

  await page.locator('#empty-box').click();
  timeline.markStep('empty-clicked');

  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? true, { timeout: 3_000 })
    .toBe(false);

  // The toast mounts inside the content-script shadow host.
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          return root?.querySelector('.ega-toast')?.textContent ?? '';
        }),
      { timeout: 4_000 },
    )
    .toMatch(/nothing to translate/i);

  // A refusal stays until dismissed; its own close button removes it.
  await page.locator('[data-ega-toast-close]').click();
  timeline.markStep('toast-dismissed');
  await expect(page.locator('.ega-toast')).toHaveCount(0);

  expect(mock.calls()).toBe(0);
});
