/* coverage: translation.sidepanel.task-switch-convo */
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

test('switching task mid-conversation re-routes subsequent dispatches', async () => {
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
      body: [
        `event: message_start`,
        `data: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","content":[]}}`,
        ``,
        `event: content_block_start`,
        `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
        ``,
        `event: content_block_delta`,
        `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"{\\"translation\\":\\"OK\\",\\"confidence\\":1}"}}`,
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

  // Turn 1 — default task=translate.
  await page.locator('#sp-text').fill('hola');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(1, { timeout: 10_000 });
  timeline.markStep('translate-turn-done');

  // Switch task to reword via the segmented picker.
  await page.locator('[data-ega-task="reword"]').click();
  await expect(page.getByRole('button', { name: /^Reword$/ })).toBeVisible();
  timeline.markStep('task-switched');

  // Turn 2 — reword.
  await page.locator('#sp-text').fill('hola');
  await page.getByRole('button', { name: /^Reword$/ }).click();
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(2, { timeout: 10_000 });
  timeline.markStep('reword-turn-done');

  // "Rewrite the text" comes from `buildTaskTemplate('reword')` — it proves the prompt re-routed, not just the label.
  expect(bodies.length).toBeGreaterThanOrEqual(2);
  expect(bodies[0] ?? '').not.toMatch(/Rewrite the text/i);
  expect(bodies[1] ?? '').toMatch(/Rewrite the text/i);
});
