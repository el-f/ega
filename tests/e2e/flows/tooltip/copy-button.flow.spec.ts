/* coverage: translation.tooltip.copy-button */
import { test, expect, type Locator } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  mockAnthropic,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline, waitForVisibleText } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await ext.context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
  });
  // The delay keeps the busy row on screen long enough to measure it.
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?', delayMs: 1000 });
});

test.afterEach(async () => {
  await ext.close();
});

test('copy button writes translation to clipboard and flips icon to Copied', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('translate-fired');

  // The busy row keeps the settled row's slots: Copy and Open in side panel wait off in their places, and
  // Stop holds the slot Ask, Regenerate and Refine take, so nothing in the row moves when the reply lands (R63).
  const actions = page.locator('.tooltip [data-ega-tooltip-actions]');
  const copy = page.locator('.tooltip button[aria-label="Copy translation"]');
  const stop = page.locator('.tooltip [data-ega-tooltip-stop]');
  const escalate = page.locator('.tooltip button[aria-label^="Open in side panel"]');
  const more = page.locator('.tooltip [data-ega-tooltip-actions] [aria-label="More"]');
  const offset = async (button: Locator): Promise<{ start: number; end: number }> => {
    const [row, box] = await Promise.all([actions.boundingBox(), button.boundingBox()]);
    if (!row || !box) throw new Error('the action row or the button is not on screen');
    return { start: box.x - row.x, end: box.x + box.width - row.x };
  };
  await expect(stop).toBeVisible();
  await expect(copy).toBeDisabled();
  const busyCopy = await offset(copy);
  const busyStop = await offset(stop);
  await expect(escalate).toHaveAttribute('aria-disabled', 'true');
  const busyEscalate = await offset(escalate);
  const busyMore = await offset(more);
  timeline.markStep('busy-row-measured');

  await waitForVisibleText(page, '.tooltip .body', 'Welcome, how are you?');
  await expect(page.locator('.tooltip button[aria-label="Regenerate"]')).toBeVisible();
  timeline.markStep('body-visible');
  const settledCopy = await offset(copy);
  expect(settledCopy.start, 'Copy moved when the reply landed').toBeCloseTo(busyCopy.start, 1);
  expect(settledCopy.end, 'Copy changed width').toBeCloseTo(busyCopy.end, 1);
  const ask = await offset(page.locator('.tooltip button[data-ega-tooltip-ask]'));
  const refine = await offset(page.locator('.tooltip button[aria-label="Refine"]'));
  expect(ask.start, 'Ask does not start where Stop did').toBeCloseTo(busyStop.start, 1);
  expect(refine.end, 'Refine does not end where Stop did').toBeCloseTo(busyStop.end, 1);
  await expect(escalate).not.toHaveAttribute('aria-disabled');
  for (const [name, busy, now] of [
    ['Open in side panel', busyEscalate, await offset(escalate)],
    ['More', busyMore, await offset(more)],
  ] as const) {
    expect(now.start, `${name} moved when the reply landed`).toBeCloseTo(busy.start, 1);
    expect(now.end, `${name} changed width`).toBeCloseTo(busy.end, 1);
  }

  await page.locator('.tooltip button[aria-label="Copy translation"]').click();
  timeline.markStep('copy-clicked');

  // A headless clipboard read needs a focused page.
  await page.locator('body').focus();
  const clip = await page.evaluate(async () => navigator.clipboard.readText());
  expect(clip).toBe('Welcome, how are you?');

  const copiedFlipped = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const btn = root?.querySelector<HTMLButtonElement>(
      '.tooltip button[aria-label="Copy translation"]',
    );
    return {
      disabled: btn?.disabled ?? null,
      hasCheck: !!btn?.querySelector('.lucide-check'),
      tooltip: btn?.getAttribute('data-tooltip') ?? null,
      announced: root?.querySelector('[data-ega-copy-live]')?.textContent.trim() ?? null,
    };
  });
  // A disabled button drops focus to <body>, and Escape is bound to the panel root — so the icon and label carry the Copied state instead.
  expect(copiedFlipped.disabled).toBe(false);
  expect(copiedFlipped.hasCheck).toBe(true);
  expect(copiedFlipped.tooltip).toBe('Copied');
  // The icon and the label are sighted-only cues; this is what a screen reader is handed.
  expect(copiedFlipped.announced).toBe('Copied');
});
