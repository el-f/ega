import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from './helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

/** Anthropic SSE body for {translation, confidence: 1}, split over two deltas to exercise partial JSON. */
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

test('follow-up question streams an answer into the conversation thread', async () => {
  // Stateful route: first call returns the translation, subsequent calls
  // return the follow-up answer.
  let callCount = 0;
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    callCount += 1;
    const body =
      callCount === 1
        ? sseBody('Welcome, how are you?')
        : sseBody('Because the pronoun forms skew Levantine.');
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

  // First turn — initial translation.
  await page.locator('#sp-text').fill('mar7aba, kifak? shu 3am ta3mel?');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  await expect(page.locator('.ega-assistant-body').first()).toContainText('Welcome', {
    timeout: 10_000,
  });

  // Second turn: a follow-up through the same input.
  await page.locator('#sp-text').fill('Why Levantine and not Egyptian?');
  await page.getByRole('button', { name: /^Translate$/ }).click();

  // Two assistant turns should now be present.
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator('.ega-assistant-turn').last()).toContainText('Levantine', {
    timeout: 10_000,
  });

  // Anthropic was hit at least twice — once for translate, once for follow-up.
  expect(callCount).toBeGreaterThanOrEqual(2);
});

test('second turn does not duplicate the first assistant response', async () => {
  // Guards against a regression where each new dispatch clones earlier
  // turns instead of appending a fresh one.
  let callCount = 0;
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    callCount += 1;
    const body = callCount === 1 ? sseBody('Welcome') : sseBody('Short answer.');
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

  await page.locator('#sp-text').fill('mar7aba');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  await expect(page.locator('.ega-assistant-body').first()).toContainText('Welcome', {
    timeout: 10_000,
  });
  // After the first turn there is exactly one assistant bubble.
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(1);

  await page.locator('#sp-text').fill('more?');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  // After the second turn there are exactly two — no duplication.
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator('.ega-assistant-turn').last()).toContainText('Short', {
    timeout: 10_000,
  });
});
