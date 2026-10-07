/* coverage: translation.popup.not-running-reload */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'test-key' });
});

test.afterEach(async () => {
  await ext.close();
});

test('a page without the content script asks for a reload, and Reload page reloads that tab', async () => {
  const timeline = createTimeline();
  const content = await ext.context.newPage();
  const url = `${ext.serverUrl}/selection-page.html`;
  await content.goto(url);
  await waitForTestHooks(content);
  // A marker the reload wipes: a fresh document has none.
  await content.evaluate(() => ((window as unknown as { __before: boolean }).__before = true));
  timeline.markStep('content-ready');

  const popup = await ext.context.newPage();
  // The popup sees the real fixture tab, but no content script answers: a page opened before Ega loaded.
  await popup.addInitScript((prefix: string) => {
    const tabs = chrome.tabs;
    const real = tabs.query.bind(tabs);
    tabs.query = (async () =>
      (await real({})).filter((t) => t.url?.startsWith(prefix))) as typeof tabs.query;
    tabs.sendMessage = (async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    }) as unknown as typeof tabs.sendMessage;
    (window as unknown as { close: () => void }).close = () => {};
  }, ext.serverUrl);
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  const status = popup.locator('[data-ega-popup-status="not-running"]');
  await expect(status).toContainText('Reload this page to use Ega here.');
  await expect(popup.getByRole('button', { name: 'Translate page' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  // Focus starts on the one action that fixes the page.
  await expect(popup.getByRole('button', { name: 'Reload page' })).toBeFocused();
  timeline.markStep('not-running-shown');

  const reloaded = content.waitForEvent('load');
  await popup.getByRole('button', { name: 'Reload page' }).click();
  await reloaded;
  await waitForTestHooks(content);
  expect(
    await content.evaluate(() => (window as unknown as { __before?: boolean }).__before),
  ).toBeUndefined();
  timeline.markStep('tab-reloaded');
});
