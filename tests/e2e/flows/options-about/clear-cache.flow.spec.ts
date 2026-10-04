/* coverage: options.about.clear-cache */
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

test('About tab Clear cache confirms then sends cache:clear to the service worker', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  // The live cache is an in-memory Map in the SW; the UI's whole job is the confirmed message.
  await page.evaluate(() => {
    const seen: unknown[] = [];
    (window as unknown as { __egaSentMsgs: unknown[] }).__egaSentMsgs = seen;
    const orig = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = ((msg: unknown, ...rest: unknown[]) => {
      seen.push(msg);
      return (orig as (...a: unknown[]) => unknown)(msg, ...rest);
    }) as typeof chrome.runtime.sendMessage;
  });
  await page.locator('#tab-about').click();
  timeline.markStep('about-active');

  await page.getByRole('button', { name: 'Clear cache' }).click();

  const dialog = page.locator('.ega-dialog', { hasText: 'Clear translation cache' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByRole('button', { name: 'Clear cache', exact: true }).click();
  timeline.markStep('confirmed');

  await expect(dialog).toBeHidden({ timeout: 5_000 });
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (window as unknown as { __egaSentMsgs: { kind?: string }[] }).__egaSentMsgs.some(
          (m) => m.kind === 'cache:clear',
        ),
      ),
    )
    .toBe(true);
  await expect(page.getByText('Translation cache cleared.')).toBeVisible({ timeout: 5_000 });
});
