/* coverage: translation.sidepanel.tone-switch-convo */
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
  return [
    `event: message_start`,
    `data: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","content":[]}}`,
    ``,
    `event: content_block_start`,
    `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
    ``,
    `event: content_block_delta`,
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(json)}}}`,
    ``,
    `event: content_block_stop`,
    `data: {"type":"content_block_stop","index":0}`,
    ``,
    `event: message_stop`,
    `data: {"type":"message_stop"}`,
    ``,
  ].join('\n');
}

test('switching tone mid-conversation re-routes the reword prompt', async () => {
  const timeline = createTimeline();
  const bodies: string[] = [];
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    bodies.push(route.request().postData() ?? '');
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
      body: sseBody(`tone#${bodies.length}`),
    });
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  // Reword task surfaces the tone select.
  await page.locator('[data-ega-task="reword"]').click();
  await expect(page.getByRole('button', { name: /^Reword$/ })).toBeVisible();
  const tone = page.locator('[data-ega-tone-select]');
  await expect(tone).toBeVisible({ timeout: 5_000 });
  timeline.markStep('reword-task-active');

  // Turn 1 — default neutral.
  await page.locator('#sp-text').fill('hey what up');
  await page.getByRole('button', { name: /^Reword$/ }).click();
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(1, { timeout: 10_000 });
  timeline.markStep('turn-1-neutral');

  await tone.selectOption('formal');
  await expect(tone).toHaveValue('formal');
  await page.locator('#sp-text').fill('hey what up');
  await page.getByRole('button', { name: /^Reword$/ }).click();
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(2, { timeout: 10_000 });
  timeline.markStep('turn-2-formal');

  expect(bodies.length).toBeGreaterThanOrEqual(2);
  // Each wire body carries its tone's TONE_PHRASE — match a distinctive substring.
  expect(bodies[0] ?? '').toMatch(/plain neutral/i);
  expect(bodies[1] ?? '').toMatch(/formal and professional/i);
});
