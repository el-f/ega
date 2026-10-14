/* coverage: translation.sidepanel.tone-switch-convo */
import { test, expect } from '@playwright/test';
import {
  type ExtensionHandle,
  launchExtension,
  seedSettings,
  sendFromPanel,
  setNextMessage,
} from '../../helpers';
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

  // Reword brings the tone row into the Next message popover.
  await setNextMessage(page, { task: 'reword' });
  await expect(page.locator('[data-ega-mode-chip]')).toHaveText('Reword');
  timeline.markStep('reword-task-active');

  // Turn 1 — default neutral.
  await sendFromPanel(page, 'hey what up');
  await expect(page.locator('[data-ega-reply]')).toHaveCount(1, { timeout: 10_000 });
  timeline.markStep('turn-1-neutral');

  await setNextMessage(page, { tone: 'formal' });
  await expect(page.locator('[data-ega-mode-chip]')).toHaveText('Reword · Formal');
  await sendFromPanel(page, 'hey what up');
  await expect(page.locator('[data-ega-reply]')).toHaveCount(2, { timeout: 10_000 });
  timeline.markStep('turn-2-formal');

  expect(bodies.length).toBeGreaterThanOrEqual(2);
  // Each wire body carries its tone's TONE_PHRASE — match a distinctive substring.
  expect(bodies[0] ?? '').toMatch(/plain neutral/i);
  expect(bodies[1] ?? '').toMatch(/formal and professional/i);
});
