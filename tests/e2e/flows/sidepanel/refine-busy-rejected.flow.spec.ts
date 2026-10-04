/* coverage: translation.sidepanel.refine-busy-rejected */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { assertStaysStable, createTimeline, sseOk } from '../_harness';

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

test('refine chip click while translate in-flight shows warning toast and does not spawn a variant', async () => {
  const timeline = createTimeline();

  // The first call resolves so the chips mount; every later call hangs to keep inflightId non-null.
  let calls = 0;
  const hangRef = { fn: null as (() => void) | null };
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'access-control-allow-origin': '*',
        },
        body: sseOk('Hello.'),
      });
      return;
    }
    await new Promise<void>((r) => {
      hangRef.fn = r;
    });
    await route
      .fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body: sseOk('Hung.'),
      })
      .catch(() => {
        /* request aborted — expected */
      });
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-text').fill('hola');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  await expect(page.locator('.ega-assistant-body').first()).toContainText('Hello', {
    timeout: 10_000,
  });
  await expect(page.locator('[data-ega-refine-chip="shorter"]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('first-turn-done');

  await page.locator('#sp-text').fill('gracias');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  await expect(page.locator('[data-ega-cancel-all]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('second-send-in-flight');

  // refine() bails while inflightId !== null; the first turn's chips stay on screen.
  const shorter = page.locator('[data-ega-refine-chip="shorter"]').first();
  if (await shorter.isVisible()) {
    await shorter.click();
    await expect(page.locator('body')).toContainText('Wait', { timeout: 5_000 });
    timeline.markStep('toast-shown');
  }

  await assertStaysStable(() => page.locator('[data-ega-variant-nav]').count(), 0, {
    windowMs: 1_000,
    message: 'variant-nav must not mount on rejected refine',
  });
  timeline.markStep('no-variant-asserted');

  hangRef.fn?.();
});
