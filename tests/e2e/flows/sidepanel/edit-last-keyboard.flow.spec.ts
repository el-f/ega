/* coverage: translation.sidepanel.edit-last-keyboard */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline, sseOk } from '../_harness';

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

test('pressing e shows the editing banner; re-send replaces last exchange and keeps the old answer as a variant', async () => {
  const timeline = createTimeline();

  let calls = 0;
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    calls += 1;
    const responses: Record<number, string> = {
      1: sseOk('Reply one.'),
      2: sseOk('Reply two.'),
      3: sseOk('Edited reply.'),
    };
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
      body: responses[calls] ?? sseOk('Fallback.'),
    });
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-text').fill('turn one');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(1, { timeout: 10_000 });
  timeline.markStep('turn-1-done');

  await page.locator('#sp-text').fill('turn two');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(2, { timeout: 10_000 });
  timeline.markStep('turn-2-done');

  // Focus a reply, not the stream box: the box only takes focus while it overflows and scrolls.
  await page.locator('.ega-assistant-turn').last().focus();
  await page.keyboard.press('e');
  timeline.markStep('e-pressed');

  await expect(page.locator('#sp-text')).toHaveValue('turn two', { timeout: 3_000 });

  // Edit mode is visible: banner above the composer, dismissable via Esc.
  await expect(page.locator('[data-ega-editing-banner]')).toBeVisible({ timeout: 3_000 });
  timeline.markStep('editing-banner-visible');

  await page.locator('#sp-text').fill('turn two edited');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  await expect(page.locator('.ega-assistant-body').last()).toContainText('Edited reply', {
    timeout: 10_000,
  });
  timeline.markStep('edited-turn-done');

  // Banner clears once the edit is sent.
  await expect(page.locator('[data-ega-editing-banner]')).toHaveCount(0, { timeout: 3_000 });

  // Still 2 user turns: the old "turn two" pair is replaced, not appended to.
  await expect(page.locator('.ega-user-turn')).toHaveCount(2, { timeout: 5_000 });
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(2, { timeout: 5_000 });

  await expect(page.locator('.ega-user-turn').first()).toContainText('turn one');
  await expect(page.locator('.ega-user-turn').last()).toContainText('turn two edited');
  timeline.markStep('exchange-counts-correct');

  // The replaced answer survives as a variant on the new turn (2/2 active).
  const lastAssistant = page.locator('.ega-assistant-turn').last();
  await expect(lastAssistant.locator('.ega-variant-counter')).toHaveText('2/2', {
    timeout: 5_000,
  });
  await lastAssistant.locator('[data-ega-variant-prev]').click();
  await expect(lastAssistant.locator('.ega-assistant-body')).toContainText('Reply two', {
    timeout: 5_000,
  });
  timeline.markStep('replaced-answer-kept-as-variant');
});

test('Esc cancels edit mode without dropping the exchange', async () => {
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
      body: sseOk('Reply.'),
    });
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-text').fill('turn one');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(1, { timeout: 10_000 });

  // The scroller takes no focus; a reader reaches the thread through a turn card, and only
  // there is 'e' a shortcut rather than a character typed into the message box.
  await page.locator('.ega-assistant-turn').first().focus();
  await page.keyboard.press('e');
  await expect(page.locator('[data-ega-editing-banner]')).toBeVisible({ timeout: 3_000 });

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ega-editing-banner]')).toHaveCount(0, { timeout: 3_000 });
  await expect(page.locator('#sp-text')).toHaveValue('');
  // Nothing was dropped.
  await expect(page.locator('.ega-user-turn')).toHaveCount(1);
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(1);
});
