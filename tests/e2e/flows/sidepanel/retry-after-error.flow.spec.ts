/* coverage: translation.sidepanel.retry-after-error */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline, sseOk } from '../_harness';

// The first failure must be retryable: AssistantTurn hides Retry for AUTH/QUOTA/NATIVE_*.

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

test('clicking Retry after an error re-fires the dispatch and lands a success turn', async () => {
  const timeline = createTimeline();
  let calls = 0;
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: { type: 'api_error', message: 'server error' } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
      body: sseOk('Recovered.'),
    });
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-text').fill('hola');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  timeline.markStep('send-clicked');

  const retryBtn = page.locator('.ega-retry-btn', { hasText: /retry/i });
  await expect(retryBtn).toBeVisible({ timeout: 10_000 });
  timeline.markStep('error-state');

  await retryBtn.click();
  timeline.markStep('retry-clicked');

  await expect(page.locator('.ega-assistant-body').first()).toContainText('Recovered', {
    timeout: 10_000,
  });
  await expect(page.locator('.ega-retry-btn', { hasText: /retry/i })).toHaveCount(0);
  await expect(page.locator('.ega-assistant-error')).toHaveCount(0);
  // Retry re-attaches to the same user turn, so the count stays at 1.
  await expect(page.locator('.ega-user-turn')).toHaveCount(1);
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(1);
  expect(calls).toBeGreaterThanOrEqual(2);
});
