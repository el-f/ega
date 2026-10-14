/* coverage: translation.sidepanel.refine-busy-rejected */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  openReplyMenu,
  refineWithPreset,
  seedSettings,
  sendFromPanel,
  type ExtensionHandle,
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

test('a refine while another version runs is rejected: the menu items say why and no third version starts', async () => {
  const timeline = createTimeline();

  // The first call resolves so the reply finishes; every later call hangs to keep a request running.
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
  await sendFromPanel(page, 'hola');
  await expect(page.locator('.ega-answer').first()).toContainText('Hello', {
    timeout: 10_000,
  });
  await refineWithPreset(page, 'shorter');
  const counter = page.locator('[data-ega-variant-nav] .ega-pager-count');
  await expect(counter).toContainText('2/2', { timeout: 5_000 });
  await expect.poll(() => calls, { timeout: 5_000 }).toBe(2);
  timeline.markStep('variant-streaming');

  // Back on the finished first answer the action row returns while version 2 still runs.
  await page.locator('[data-ega-variant-prev]').click();
  await expect(counter).toContainText('1/2');
  await expect(page.locator('[data-ega-meta-item="status"]')).toHaveText('Version 2 loading…');
  const menu = await openReplyMenu(page, 'refine');
  await expect(menu.getByText('Wait for the current reply to finish.')).toBeVisible();
  const shorter = menu.locator('[data-ega-refine-preset="shorter"]');
  // The items stay in the arrow order, marked, with the reason as their description.
  await expect(shorter).toHaveAttribute('aria-disabled', 'true');
  await expect(shorter).toHaveAccessibleDescription('Wait for the current reply to finish.');
  await expect(menu.locator('[data-ega-describe-change]')).toHaveAttribute('aria-disabled', 'true');
  timeline.markStep('items-marked');

  // force: Playwright treats aria-disabled as not clickable, but a user can still click the item.
  await shorter.click({ force: true });
  // The menu stays open on a refused pick, and nothing reaches the backend.
  await expect(shorter).toBeVisible();
  await assertStaysStable(() => calls, 2, {
    windowMs: 1_000,
    message: 'a refine during a running version must send nothing',
  });
  await expect(counter).toContainText('1/2');
  timeline.markStep('no-variant-asserted');

  hangRef.fn?.();
});
