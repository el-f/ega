/* coverage: translation.tooltip.retry-on-error */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline, waitForVisibleText } from '../_harness';

// No mockAnthropic helper here: the response has to change between the two calls.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('retry after an error fires a second request and renders the success body', async () => {
  const timeline = createTimeline();

  let calls = 0;
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    calls += 1;
    if (calls === 1) {
      // A retryable 500 — terminal codes (401 AUTH) hide the Retry button by design.
      await route.fulfill({
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: { type: 'api_error', message: 'server exploded' } }),
      });
      return;
    }
    const json = JSON.stringify({ translation: 'Welcome back', confidence: 0.95 });
    const mid = Math.max(1, Math.floor(json.length / 2));
    const first = JSON.stringify(json.slice(0, mid));
    const second = JSON.stringify(json.slice(mid));
    const body = [
      `event: message_start`,
      `data: {"type":"message_start","message":{"id":"m1","type":"message","role":"assistant","content":[]}}`,
      ``,
      `event: content_block_start`,
      `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
      ``,
      `event: content_block_delta`,
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${first}}}`,
      ``,
      `event: content_block_delta`,
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${second}}}`,
      ``,
      `event: content_block_stop`,
      `data: {"type":"content_block_stop","index":0}`,
      ``,
      `event: message_stop`,
      `data: {"type":"message_stop"}`,
      ``,
    ].join('\n');
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
      body,
    });
  });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('translate-fired');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          return !!root?.querySelector('.tooltip [data-ega-retry]');
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
  timeline.markStep('error-rendered');
  expect(calls).toBe(1);

  // A real click: Retry ignores a click the page dispatches.
  await page.locator('.tooltip [data-ega-retry]').click();
  timeline.markStep('retry-clicked');

  await waitForVisibleText(page, '.tooltip .body', 'Welcome back', { timeoutMs: 10_000 });
  timeline.markStep('body-visible');
  expect(calls).toBe(2);
});
