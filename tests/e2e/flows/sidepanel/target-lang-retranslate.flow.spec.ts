/* coverage: translation.sidepanel.target-lang-retranslate */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
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

test('picking a new target language re-answers the last turn as a variant in that language', async () => {
  const timeline = createTimeline();
  const bodies: string[] = [];
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    bodies.push(route.request().postData() ?? '');
    const text =
      bodies.length === 1
        ? JSON.stringify({ translation: 'Hello there.', confidence: 1 })
        : JSON.stringify({ translation: 'Bonjour.', confidence: 1 });
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
  await page.getByRole('button', { name: /^Translate$/ }).click();
  const turn = page.locator('.ega-assistant-turn');
  await expect(turn).toHaveCount(1, { timeout: 10_000 });
  await expect(turn).toContainText('Hello there.');
  timeline.markStep('first-answer');

  // No send: the picker alone drives the second call.
  await page.locator('#sp-conv-target').selectOption('fr');
  timeline.markStep('target-picked');

  const nav = page.locator('[data-ega-variant-nav]');
  await expect(nav.locator('.ega-variant-counter')).toHaveText('2/2', { timeout: 10_000 });
  await expect(turn).toHaveCount(1);
  await expect(turn).toContainText('Bonjour.');
  await expect(page.locator('[data-ega-lang-chip]')).toHaveText(/French/);
  timeline.markStep('re-answered');

  expect(bodies).toHaveLength(2);
  expect(bodies[0] ?? '').not.toMatch(/French/);
  expect(bodies[1] ?? '').toMatch(/French/);

  // The previous answer is one click away, and picking it back costs no request.
  await nav.locator('[data-ega-variant-prev]').click();
  await expect(turn).toContainText('Hello there.');
  await page.locator('#sp-conv-target').selectOption('en');
  await expect(nav.locator('.ega-variant-counter')).toHaveText('1/2');
  await page.locator('#sp-conv-target').selectOption('fr');
  await expect(nav.locator('.ega-variant-counter')).toHaveText('2/2');
  await expect(turn).toContainText('Bonjour.');
  expect(bodies).toHaveLength(2);
  timeline.markStep('flip-back-no-request');
});
