import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('extension loads and content script boots on http pages', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);

  // Set as the entry's last statement, so it also proves no install threw — the guard for boot errors like `$state is not defined`.
  await expect(page.locator('html[data-ega-content-booted]')).toHaveCount(1);

  // Missing means the build was not produced with EGA_E2E_HOOKS=1.
  await waitForTestHooks(page);

  const hostBeforeUse = await page.evaluate(() => !!document.getElementById('ega-shadow-host'));
  expect(hostBeforeUse).toBe(false);
  await expect(page.locator('html[data-ega-host-installed]')).toHaveCount(0);
});

test('the shadow host mounts on the first surface that needs it', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
  });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  await selectArabiziParagraph(page);

  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);
  const hostAfterUse = await page.evaluate(() => !!document.getElementById('ega-shadow-host'));
  expect(hostAfterUse).toBe(true);
  await expect(page.locator('html[data-ega-host-installed]')).toHaveCount(1);
});

test('selection + hotkey streams a translation into the tooltip', async () => {
  const mock = mockAnthropic(ext.context, {
    translation: 'Welcome, how are you?',
    confidence: 0.93,
  });

  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key-abc',
    streaming: true,
    tooltipClickOutside: true,
    contextEnabled: false,
    shortcut: 'Ctrl+Shift+L',
  });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  // Select and fire hotkey. Focus the page first so keyboard events hit it.
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');

  // Tooltip eventually gets a body that matches the mock translation.
  await expect
    .poll(async () => (await egaTest<number>(page, 'tooltipCount')) ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(0);

  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 10_000 })
    .toContain('Welcome, how are you?');

  // Anthropic route was actually hit by the background service worker.
  expect(mock.calls()).toBeGreaterThanOrEqual(1);
});

test('selection fires selectionchange and exposes the shadow host to the page', async () => {
  mockAnthropic(ext.context);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    tooltipClickOutside: true,
  });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  await selectArabiziParagraph(page);

  // A throwing selectionchange handler keeps the host but kills later handlers; hasHost proves the runtime answers.
  const hasHost = await egaTest<boolean>(page, 'hasHost');
  expect(hasHost).toBe(true);
});
