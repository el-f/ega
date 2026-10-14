import { test, expect } from '@playwright/test';
import {
  launchExtension,
  onlyBackends,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';
import { assertStaysStable } from './flows/_harness';

// The pill sits in Ega's open shadow root, so a page script can reach its buttons. A click the page dispatches does nothing.
let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    ...onlyBackends('anthropic'),
    pageTranslateMode: 'inplace',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('a pill Try again the page dispatches sends nothing; a real click sends', async () => {
  let calls = 0;
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    calls += 1;
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
    });
  });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);
  const sw = ext.context.serviceWorkers()[0];
  await sw?.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { kind: 'page:translateAll' });
  });
  const retry = page.locator('[data-ega-batch-retry]');
  await retry.waitFor({ state: 'visible', timeout: 20_000 });
  const before = calls;

  await page.evaluate(() => {
    document
      .getElementById('ega-shadow-host')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-ega-batch-retry]')
      ?.click();
  });
  await assertStaysStable(() => calls, before, { windowMs: 2_000 });

  await retry.click();
  await expect.poll(() => calls, { timeout: 10_000 }).toBeGreaterThan(before);
});
