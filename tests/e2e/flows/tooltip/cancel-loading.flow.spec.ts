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
import { assertStaysStable, createTimeline } from '../_harness';

// The mock is slowed so the loading row stays on screen long enough to click Cancel.
const MOCK_DELAY_MS = 1500;

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
  });
  mockAnthropic(ext.context, {
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
          return root?.querySelector('.tooltip .actions button')?.textContent.trim() ?? '';
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

  await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const btn = Array.from(
      root?.querySelectorAll<HTMLButtonElement>('.tooltip .actions button') ?? [],
    ).find((b) => b.textContent.trim() === 'Stop');
    if (!btn) throw new Error('cancel button missing');
    btn.click();
  });
  timeline.markStep('cancel-clicked');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          return root?.querySelector('[data-ega-meta-item="status"]')?.textContent === 'Stopped';
        }),
      { timeout: 3_000 },
    )
    .toBe(true);

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
