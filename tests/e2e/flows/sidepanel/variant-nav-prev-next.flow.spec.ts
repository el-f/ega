/* coverage: translation.sidepanel.variant-nav-prev-next */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  type ExtensionHandle,
  refineWithPreset,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    contextEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('after refine spawns variant 2/2, prev nav reverts to 1/2 and body changes', async () => {
  const timeline = createTimeline();

  // The refine call returns a different string so the two variants are distinguishable.
  let calls = 0;
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    calls += 1;
    const text =
      calls === 1
        ? JSON.stringify({ translation: 'Original text.', confidence: 1 })
        : JSON.stringify({ translation: 'Refined text.', confidence: 1 });
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
      body: [
        `event: message_start`,
        `data: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","content":[]}}`,
        ``,
        `event: content_block_start`,
        `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
        ``,
        `event: content_block_delta`,
        `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(text)}}}`,
        ``,
        `event: content_block_stop`,
        `data: {"type":"content_block_stop","index":0}`,
        ``,
        `event: message_stop`,
        `data: {"type":"message_stop"}`,
        ``,
      ].join('\n'),
    });
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-text').fill('hola');
  await page.locator('#sp-text').press('Enter');
  await expect(page.locator('.ega-answer').first()).toContainText('Original text', {
    timeout: 10_000,
  });
  timeline.markStep('first-turn-done');

  await refineWithPreset(page, 'shorter');
  timeline.markStep('preset-picked');

  const nav = page.locator('[data-ega-variant-nav]');
  await expect(nav).toBeVisible({ timeout: 10_000 });
  const counter = nav.locator('.ega-pager-count');
  await expect(counter).toHaveText('2/2', { timeout: 10_000 });
  await expect(page.locator('.ega-answer').first()).toContainText('Refined text', {
    timeout: 10_000,
  });
  timeline.markStep('variant-2-shown');

  const prevBtn = page.locator('[data-ega-variant-prev]');
  await prevBtn.click();
  await expect(counter).toHaveText('1/2', { timeout: 3_000 });
  await expect(page.locator('.ega-answer').first()).toContainText('Original text', {
    timeout: 5_000,
  });
  timeline.markStep('variant-1-restored');
});
