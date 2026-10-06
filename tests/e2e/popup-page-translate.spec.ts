import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    defaultDisplayMode: 'tooltip',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('popup "Translate page" button wraps content on a tooltip-default site', async () => {
  mockAnthropic(ext.context, { translation: 'TRANSLATED' });

  // Open the content page first so resolveContentTab() has a non-extension tab to find.
  const content = await ext.context.newPage();
  await content.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(content);

  const popup = await ext.context.newPage();
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await popup.getByRole('button', { name: 'Translate page' }).waitFor({ timeout: 5_000 });

  // A real popup leaves the content tab active; opening the popup as a tab does not.
  await content.bringToFront();
  await popup.getByRole('button', { name: 'Translate page' }).click();

  // Translate page runs the whole page: no area picking first.
  expect(await egaTest<boolean>(content, 'msIsActive')).toBe(false);
  await expect
    .poll(async () => (await egaTest<number>(content, 'inlineCount')) ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(0);
});
