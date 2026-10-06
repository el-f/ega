/* coverage: translation.sidepanel.refine-busy-rejected */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  type ExtensionHandle,
  openRefineChips,
} from '../../helpers';
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

test('a refine while a sibling variant streams is rejected: the chips say why and no third variant starts', async () => {
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
  await openRefineChips(page);
  await page.locator('[data-ega-refine-chip="shorter"]').click();
  const counter = page.locator('[data-ega-variant-nav] .ega-variant-counter');
  await expect(counter).toContainText('2/2', { timeout: 5_000 });
  await expect.poll(() => calls, { timeout: 5_000 }).toBe(2);
  timeline.markStep('variant-streaming');

  // Back on the finished first answer the card is done again, so Refine returns while variant 2 still streams.
  await page.locator('[data-ega-variant-prev]').click();
  await expect(counter).toContainText('1/2');
  await expect(page.locator('[data-ega-variant-busy]')).toHaveText('· 2 loading');
  await openRefineChips(page);
  await expect(
    page.getByRole('group', { name: 'Quick refine — wait for this reply to finish' }),
  ).toBeVisible();
  const shorter = page.locator('[data-ega-refine-chip="shorter"]');
  await expect(shorter).toBeDisabled();
  await expect(page.locator('[data-ega-refine-chip="custom"]')).toBeDisabled();
  timeline.markStep('chips-disabled');

  // force: a disabled button takes no click, which is the point; nothing may reach the backend.
  await shorter.click({ force: true });
  await assertStaysStable(() => calls, 2, {
    windowMs: 1_000,
    message: 'a refine during a running variant must send nothing',
  });
  await expect(counter).toContainText('1/2');
  timeline.markStep('no-variant-asserted');

  hangRef.fn?.();
});
