/* coverage: translation.sidepanel.cancel-all-inflight */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { assertStaysStable, createTimeline } from '../_harness';

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

test('More actions offers Cancel all requests while streaming → pick it → item gone + turn exits streaming', async () => {
  const timeline = createTimeline();

  // The route hangs until the test releases it, so the in-flight state stays observable.
  const releaseRef = { fn: null as (() => void) | null };
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await new Promise<void>((r) => {
      releaseRef.fn = r;
    });
    // message_stop lets the parser close cleanly if the request was not aborted first.
    await route
      .fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body: [`event: message_stop`, `data: {"type":"message_stop"}`, ``].join('\n'),
      })
      .catch(() => {
        /* request already aborted — that's expected */
      });
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-text').fill('hola');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  timeline.markStep('send-clicked');

  await expect(page.locator('.ega-assistant-turn')).toHaveCount(1, { timeout: 5_000 });

  // The composer's Stop is the one stop control on screen; the header has none.
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('.sp-header [data-ega-cancel-all]')).toHaveCount(0);

  await page.locator('[data-ega-header-more]').click();
  const cancelItem = page.locator('[data-ega-cancel-all]');
  await expect(cancelItem).toBeVisible({ timeout: 5_000 });
  timeline.markStep('cancel-item-visible');

  await cancelItem.click();
  timeline.markStep('cancel-clicked');

  // The menu closes on select, and a fresh open no longer offers the item.
  await expect(cancelItem).toHaveCount(0, { timeout: 5_000 });
  await page.locator('[data-ega-header-more]').click();
  await expect(page.locator('[data-ega-export-markdown]')).toBeVisible();
  await expect(page.locator('[data-ega-cancel-all]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  timeline.markStep('cancel-item-gone');

  await assertStaysStable(() => page.locator('.ega-cursor').count(), 0, {
    windowMs: 1_000,
    message: 'streaming cursor must be gone after cancel',
  });
  timeline.markStep('streaming-exited');

  releaseRef.fn?.();
});
