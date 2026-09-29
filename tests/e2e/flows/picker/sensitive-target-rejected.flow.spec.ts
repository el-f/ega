/* coverage: vision.picker.sensitive-target-rejected */
import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
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
    pickerEnabled: true,
    pickerShortcut: 'Ctrl+Shift+E',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('clicking a password field in picker mode is a safe no-op', async () => {
  const timeline = createTimeline();
  const mock = mockAnthropic(ext.context);

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');
  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false, { timeout: 3_000 })
    .toBe(true);
  timeline.markStep('picker-entered');

  await page.locator('#pw').click();
  timeline.markStep('password-clicked');

  // The rejected click explains itself with a toast instead of looking frozen.
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
    .toMatch(/does not read password/i);
  timeline.markStep('toast-visible');

  // No DOM primitive asserts "nothing happened", so sample both invariants over a window.
  await assertStaysStable(
    async () => {
      const active = (await egaTest<boolean>(page, 'pickerIsActive')) ?? false;
      return active && mock.calls() === 0;
    },
    true,
    { windowMs: 500, message: 'picker must stay active and fire no translate' },
  );

  // Cleanup so afterEach doesn't deadlock on a stuck overlay.
  await page.keyboard.press('Escape');
});
