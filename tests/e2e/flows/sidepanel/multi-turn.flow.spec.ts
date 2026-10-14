/* coverage: translation.sidepanel.multi-turn */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

function sseBody(translation: string): string {
  const json = JSON.stringify({ translation, confidence: 1 });
  const mid = Math.max(1, Math.floor(json.length / 2));
  const first = JSON.stringify(json.slice(0, mid));
  const second = JSON.stringify(json.slice(mid));
  return [
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
}

test('second turn retains the prior conversation state and re-fires the router', async () => {
  const timeline = createTimeline();
  let callCount = 0;
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    callCount += 1;
    const body = callCount === 1 ? sseBody('First reply.') : sseBody('Second reply.');
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
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-text').fill('marhaba');
  await page.locator('#sp-text').press('Enter');
  await expect(page.locator('.ega-answer').first()).toContainText('First', {
    timeout: 10_000,
  });
  await expect(page.locator('.ega-user-turn')).toHaveCount(1);
  await expect(page.locator('[data-ega-reply]')).toHaveCount(1);
  timeline.markStep('turn-1-rendered');

  await page.locator('#sp-text').fill('shukran');
  await page.locator('#sp-text').press('Enter');
  await expect(page.locator('[data-ega-reply]')).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator('.ega-user-turn')).toHaveCount(2);
  await expect(page.locator('[data-ega-reply]').last()).toContainText('Second', {
    timeout: 10_000,
  });
  timeline.markStep('turn-2-rendered');

  // jsdom computes no styles, so only a real render can tell that every reply looks the same (no box).
  const older = page.locator('[data-ega-reply]').first();
  const newest = page.locator('[data-ega-reply]').last();
  const look = (el: Element): string => {
    const cs = getComputedStyle(el);
    return `${cs.borderTopStyle} ${cs.backgroundColor}`;
  };
  expect(await older.evaluate(look)).toBe(await newest.evaluate(look));
  // The older reply hides its action row until hover, with the row's height kept.
  await page.mouse.move(0, 0);
  const olderRow = older.locator('.ega-reply-actions');
  await expect(olderRow).toHaveCSS('opacity', '0');
  const height = await older.evaluate((el) => (el as HTMLElement).offsetHeight);
  await older.hover();
  await expect(olderRow).toHaveCSS('opacity', '1');
  expect(await older.evaluate((el) => (el as HTMLElement).offsetHeight)).toBe(height);

  await expect(page.locator('.ega-user-turn').first()).toContainText('marhaba');
  expect(callCount).toBeGreaterThanOrEqual(2);
});
