/* coverage: translation.sidepanel.try-as-swap */
import { test, expect, type BrowserContext } from '@playwright/test';
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

test('Try as → Swap languages re-answers the last turn the other way, from the keyboard', async () => {
  const timeline = createTimeline();
  const bodies = await routeAnswers(ext.context, ['Hello.', 'Hola.']);
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-conv-source').selectOption('es');
  await page.locator('#sp-text').fill('hola');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  const turn = page.locator('.ega-assistant-turn');
  await expect(turn).toContainText('Hello.', { timeout: 10_000 });
  timeline.markStep('first-answer');

  // No separate swap row: the swap is the first item of the Try as menu.
  const trigger = page.getByRole('button', { name: 'Try as another task' });
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const swap = page.locator('[data-ega-swap-item]');
  await expect(swap).toBeFocused();
  await expect(swap).toHaveText('Swap languages (English → Spanish)');
  await expect(swap).toHaveAttribute('aria-disabled', 'false');
  timeline.markStep('menu-open');

  await page.keyboard.press('Enter');
  await expect(swap).toHaveCount(0);
  const nav = page.locator('[data-ega-variant-nav]');
  await expect(nav.locator('.ega-variant-counter')).toHaveText('2/2', { timeout: 10_000 });
  await expect(turn).toHaveCount(1);
  await expect(turn).toContainText('Hola.');
  await expect(page.locator('[data-ega-lang-chip]')).toHaveText(/Spanish/);
  expect(bodies).toHaveLength(2);
  expect(bodies[1] ?? '').toMatch(/Spanish/);
  timeline.markStep('swapped');
});

test('a blocked swap stays readable in the menu and says why', async () => {
  const timeline = createTimeline();
  const bodies = await routeAnswers(ext.context, ['Hello.']);
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  // Auto-detect with no detected language from the model leaves nothing to swap from.
  await page.locator('#sp-text').fill('hola');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  await expect(page.locator('.ega-assistant-turn')).toContainText('Hello.', { timeout: 10_000 });
  timeline.markStep('first-answer');

  await page.locator('[data-ega-task-switch]').click();
  const swap = page.locator('[data-ega-swap-item]');
  await expect(swap).toHaveAttribute('aria-disabled', 'true');
  await expect(swap.locator('[data-ega-swap-note]')).toHaveText(
    'No source language to swap from yet',
  );
  await expect(swap.locator('[data-ega-swap-note]')).toBeVisible();
  timeline.markStep('blocked-shown');

  // force: Playwright treats aria-disabled as not clickable, but a user can still click the item.
  await swap.click({ force: true });
  // The menu stays open on a blocked pick, and nothing is sent.
  await expect(swap).toBeVisible();
  expect(bodies).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(swap).toHaveCount(0);
  timeline.markStep('no-request');
});
