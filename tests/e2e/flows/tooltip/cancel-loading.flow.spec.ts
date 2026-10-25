/* coverage: translation.tooltip.cancel-loading */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  mockAnthropic,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { assertStaysStable, createTimeline, expectNothingMoves } from '../_harness';

// The mock is slowed so the loading row stays on screen long enough to click Cancel.
const MOCK_DELAY_MS = 1500;

let ext: ExtensionHandle;
let mock: ReturnType<typeof mockAnthropic>;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
  });
  mock = mockAnthropic(ext.context, {
    translation: 'Welcome, how are you?',
    confidence: 0.95,
    delayMs: MOCK_DELAY_MS,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Stop aborts the request and retains a neutral retryable tooltip', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('translate-fired');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          return root?.querySelector('.tooltip [data-ega-tooltip-stop]')?.textContent.trim() ?? '';
        }),
      { timeout: 5_000 },
    )
    .toBe('Stop');
  timeline.markStep('cancel-visible');

  // Bubble and tooltip both anchor near rect.bottom, so they overlap unless openTooltip drops the bubble.
  const bubbleGone = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return root?.querySelector('.bubble') == null;
  });
  expect(bubbleGone, 'bubble must be dismissed once the tooltip mounts').toBe(true);

  // Compare edges, not pixel positions, so spacing tweaks do not break the test.
  const overlap = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const topbar = root?.querySelector('.tooltip .tooltip-topbar') as HTMLElement | null;
    const shimmer = root?.querySelector('.tooltip .shimmer-wrap') as HTMLElement | null;
    if (!topbar || !shimmer) return null;
    const t = topbar.getBoundingClientRect();
    const s = shimmer.getBoundingClientRect();
    return { topbarBottom: t.bottom, shimmerTop: s.top };
  });
  expect(overlap).not.toBeNull();
  if (overlap) {
    expect(overlap.topbarBottom, 'topbar must end before shimmer begins').toBeLessThanOrEqual(
      overlap.shimmerTop + 0.5,
    );
  }

  // Retry takes Stop's place at Stop's width, and Copy and the icons after it stay put (R63). Measured from the
  // tooltip's edge, so a body that shrinks on Stop and lifts the row fails too.
  const actions = page.locator('.tooltip [data-ega-tooltip-actions]');
  await expectNothingMoves(
    {
      Copy: actions.locator('button[aria-label^="Copy"]'),
      'Stop -> Retry': actions.locator('.tooltip-stop-retry'),
      'Open in side panel': actions.locator('button[aria-label^="Open in side panel"]'),
      More: actions.locator('[aria-label="More"]'),
    },
    async () => {
      // By keyboard: Stop and Retry are one button, so focus stays on it when it turns into Retry.
      await actions.locator('.tooltip-stop-retry').focus();
      await page.keyboard.press('Enter');
      timeline.markStep('cancel-clicked');

      await expect
        .poll(
          async () =>
            await page.evaluate(() => {
              const host = document.querySelector('#ega-shadow-host');
              const root = (host as HTMLElement | null)?.shadowRoot;
              return (
                root?.querySelector('[data-ega-meta-item="status"]')?.textContent === 'Stopped'
              );
            }),
          { timeout: 3_000 },
        )
        .toBe(true);
      await expect(actions.locator('.tooltip-stop-retry')).toHaveText('Retry');
      await expect(actions.locator('.tooltip-stop-retry')).toBeFocused();
    },
    page.locator('.tooltip'),
  );

  // Sample past the mock delay: the SSE lands after cancel and must not re-mount the tooltip.
  await assertStaysStable(
    async () =>
      await page.evaluate(() => {
        const host = document.querySelector('#ega-shadow-host');
        const root = (host as HTMLElement | null)?.shadowRoot;
        return root?.querySelector('[data-ega-meta-item="status"]')?.textContent === 'Stopped';
      }),
    true,
    { windowMs: MOCK_DELAY_MS + 500, message: 'late SSE must not re-mount the canceled tooltip' },
  );
});

// Stop turns into Retry in place, so the second click of a real double-click lands on Retry.
test('a double-click on Stop stops the reply and does not start it again', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');

  const button = page.locator('.tooltip .tooltip-stop-retry');
  await expect(button).toHaveText('Stop');
  // The request must be on the wire first, or a fast Stop cancels it before the mock ever counts it.
  await expect.poll(() => mock.calls(), { timeout: 5_000 }).toBe(1);
  const stopBox = await button.boundingBox();
  if (!stopBox) throw new Error('Stop has no box');
  const at = { x: stopBox.x + stopBox.width / 2, y: stopBox.y + stopBox.height / 2 };
  await page.mouse.dblclick(at.x, at.y);

  const status = page.locator('.tooltip [data-ega-meta-item="status"]');
  await expect(status).toHaveText('Stopped');
  await expect(button).toHaveText('Retry');
  // Positive control: the double-click point is on Retry, so a second click that acted would have retried.
  const retryBox = await button.boundingBox();
  if (!retryBox) throw new Error('Retry has no box');
  expect(at.y).toBeGreaterThanOrEqual(retryBox.y);
  expect(at.y).toBeLessThanOrEqual(retryBox.y + retryBox.height);

  await assertStaysStable(
    async () => ({
      calls: mock.calls(),
      status: await status.textContent({ timeout: 500 }).catch(() => null),
    }),
    { calls: 1, status: 'Stopped' },
    { windowMs: MOCK_DELAY_MS + 500, message: 'the second click must not send the request again' },
  );
});
