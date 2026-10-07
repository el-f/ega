/* coverage: translation.sidepanel.try-as-swap */
import { test, expect, type BrowserContext } from '@playwright/test';
import {
  launchExtension,
  openReplyMenu,
  seedSettings,
  sendFromPanel,
  setNextMessage,
  type ExtensionHandle,
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

/** Answers every call with the next text and records each request body. */
async function routeAnswers(context: BrowserContext, answers: string[]): Promise<string[]> {
  const bodies: string[] = [];
  await context.route('https://api.anthropic.com/v1/messages', async (route) => {
    bodies.push(route.request().postData() ?? '');
    const text = JSON.stringify({ translation: answers[bodies.length - 1] ?? 'x', confidence: 1 });
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
  return bodies;
}

test('Refine → Swap re-answers the reply the other way, from the keyboard', async () => {
  const timeline = createTimeline();
  const bodies = await routeAnswers(ext.context, ['Hello.', 'Hola.']);
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await setNextMessage(page, { source: 'es' });
  await sendFromPanel(page, 'hola');
  const turn = page.locator('[data-ega-reply]');
  await expect(turn).toContainText('Hello.', { timeout: 10_000 });
  await expect(turn.locator('[data-ega-meta-item="direction"]')).toHaveText('Spanish → English');
  timeline.markStep('first-answer');

  // The swap is the last item of the reply's Refine menu; End reaches it from the keyboard.
  const trigger = turn.locator('[data-ega-action="refine"]');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-ega-refine-preset]').first()).toBeFocused();
  await page.keyboard.press('End');
  const swap = page.locator('[data-ega-swap-item]');
  await expect(swap).toBeFocused();
  await expect(swap).toHaveText('Swap: English → Spanish');
  timeline.markStep('menu-open');

  await page.keyboard.press('Enter');
  await expect(swap).toHaveCount(0);
  // The action row unmounts while the swap runs, so focus waits on the reply, not on <body>.
  await expect(turn).toBeFocused();
  const nav = page.locator('[data-ega-variant-nav]');
  await expect(nav.locator('.ega-pager-count')).toHaveText('2/2', { timeout: 10_000 });
  await expect(turn).toHaveCount(1);
  await expect(turn).toContainText('Hola.');
  await expect(turn.locator('[data-ega-meta-item="direction"]')).toHaveText('English → Spanish');
  expect(bodies).toHaveLength(2);
  expect(bodies[1] ?? '').toMatch(/Spanish/);
  timeline.markStep('swapped');

  // Swapping back would repeat version 1, so the menu no longer offers it.
  await openReplyMenu(page, 'refine', turn);
  await expect(page.locator('[data-ega-refine-preset]').first()).toBeVisible();
  await expect(swap).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(bodies).toHaveLength(2);
  timeline.markStep('repeat-not-offered');
});

test('no swap is offered when the reply has no known source language', async () => {
  const timeline = createTimeline();
  const bodies = await routeAnswers(ext.context, ['Hello.']);
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  // Auto-detect with no detected language from the model leaves nothing to swap from.
  await sendFromPanel(page, 'hola');
  await expect(page.locator('[data-ega-reply]')).toContainText('Hello.', { timeout: 10_000 });
  timeline.markStep('first-answer');

  const menu = await openReplyMenu(page, 'refine');
  await expect(menu.locator('[data-ega-translate-into-other]')).toBeVisible();
  await expect(menu.locator('[data-ega-swap-item]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  expect(bodies).toHaveLength(1);
  timeline.markStep('no-swap');
});
