import { test, expect, type Page } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

// A page shares the content script's DOM, so it can dispatch the very events Ega listens to. None may start a request.
let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    bubbleMode: 'always',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

async function select(page: Page, id: string): Promise<void> {
  await page.evaluate((elId) => {
    const el = document.getElementById(elId);
    if (!el) throw new Error(`#${elId} missing`);
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) throw new Error('no window.getSelection()');
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  }, id);
}

test('a shortcut the page dispatches sends nothing; a real key press sends', async () => {
  const api = mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  await select(page, 'arabizi');
  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'L',
        code: 'KeyL',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );
  });
  // Long enough for an accepted keydown to reach the API; the real press below proves the path works.
  await page.waitForTimeout(2000);

  await select(page, 'arabizi-short');
  await page.keyboard.press('Control+Shift+L');
  await expect.poll(() => api.calls(), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(500);

  expect(api.calls()).toBe(1);
  expect(api.lastRequestBody() ?? '').toContain('Min hayde');
});

test('a bubble click the page dispatches sends nothing; a real click sends', async () => {
  const api = mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await select(page, 'arabizi');
  const bubble = page.locator('[data-ega-bubble-wrap] button.bubble');
  await bubble.waitFor({ state: 'visible', timeout: 5_000 });

  await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    host?.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-ega-bubble-wrap] button.bubble')
      ?.click();
  });
  await page.waitForTimeout(2000);
  expect(api.calls()).toBe(0);

  await bubble.click();
  await expect.poll(() => api.calls(), { timeout: 15_000 }).toBe(1);
});

test('a Retry click the page dispatches sends nothing; a real click sends', async () => {
  let calls = 0;
  // A retryable 500 on every call: a terminal code (401) hides Retry, and only the count matters here.
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    calls += 1;
    await route.fulfill({
      status: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { type: 'api_error', message: 'server exploded' } }),
    });
  });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await select(page, 'arabizi');
  await page.locator('[data-ega-bubble-wrap] button.bubble').click();
  const retry = page.locator('.tooltip [data-ega-retry]');
  await retry.waitFor({ state: 'visible', timeout: 10_000 });
  expect(calls).toBe(1);

  await page.evaluate(() => {
    document
      .querySelector('#ega-shadow-host')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('.tooltip [data-ega-retry]')
      ?.click();
  });
  await page.waitForTimeout(2000);
  expect(calls).toBe(1);

  await retry.click();
  await expect.poll(() => calls, { timeout: 10_000 }).toBe(2);
});

test('a task change the page dispatches sends nothing; a user-driven change sends', async () => {
  const api = mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await select(page, 'arabizi');
  await page.locator('[data-ega-bubble-wrap] button.bubble').click();
  await expect.poll(() => api.calls(), { timeout: 15_000 }).toBe(1);
  await page.locator('select[data-ega-task-select]').waitFor({ state: 'visible', timeout: 5_000 });

  await page.evaluate(() => {
    const sel = document
      .querySelector('#ega-shadow-host')
      ?.shadowRoot?.querySelector<HTMLSelectElement>('select[data-ega-task-select]');
    if (!sel) throw new Error('task select missing');
    sel.value = 'explain';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(2000);
  expect(api.calls()).toBe(1);

  // The hook dispatches the same change as the user would; Playwright's selectOption cannot reach the shadow root.
  expect(await egaTest<boolean>(page, 'setTooltipSelect', 'task:explain')).toBe(true);
  await expect.poll(() => api.calls(), { timeout: 10_000 }).toBe(2);
});
