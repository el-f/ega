/* coverage: options.advanced.clear-cache */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Advanced > Data Clear cache acts at once and sends cache:clear to the service worker', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  // The live cache is an in-memory Map in the SW; the UI's whole job is the message.
  await page.evaluate(() => {
    const seen: unknown[] = [];
    (window as unknown as { __egaSentMsgs: unknown[] }).__egaSentMsgs = seen;
    const orig = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = ((msg: unknown, ...rest: unknown[]) => {
      seen.push(msg);
      return (orig as (...a: unknown[]) => unknown)(msg, ...rest);
    }) as typeof chrome.runtime.sendMessage;
  });
  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="data"]').click();
  timeline.markStep('data-active');

  const row = page.locator('[data-ega-setting="about.clearCache"]');
  await expect(row).toContainText('Clear saved answers');
  await expect(row).toContainText('Translations run again next time');
  await row.getByRole('button', { name: 'Clear cache' }).click();
  timeline.markStep('clicked');

  // Nothing a user loses, so no confirm.
  await expect(page.locator('.ega-dialog')).toHaveCount(0);
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (window as unknown as { __egaSentMsgs: { kind?: string }[] }).__egaSentMsgs.some(
          (m) => m.kind === 'cache:clear',
        ),
      ),
    )
    .toBe(true);
  await expect(page.getByText('Saved answers cleared')).toBeVisible({ timeout: 5_000 });
});
