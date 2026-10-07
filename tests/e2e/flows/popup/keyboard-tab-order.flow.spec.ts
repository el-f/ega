/* coverage: translation.popup.keyboard-tab-order */
import { test, expect } from '@playwright/test';
import { launchExtension, onlyBackends, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline, readFocus, type FocusStop } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    ...onlyBackends('anthropic'),
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Tab walks the popup top to bottom with a visible ring; Esc closes the backend popover', async () => {
  const timeline = createTimeline();
  const popup = await ext.context.newPage();
  await popup.setViewportSize({ width: 380, height: 600 });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  const chip = popup.locator('.active-backend-chip');
  await expect(chip).toHaveAttribute('aria-label', /^Anthropic is ready/, {
    timeout: 5_000,
  });
  timeline.markStep('popup-ready');

  const stops: FocusStop[] = [];
  for (let i = 0; i < 15; i++) {
    await popup.keyboard.press('Tab');
    const stop = await readFocus(popup);
    if (stop === null) break;
    stops.push(stop);
  }
  // The swap is blocked while the source is auto, but stays a tab stop so its reason can be read.
  expect(stops.map((s) => s.name)).toEqual([
    expect.stringMatching(/^Anthropic is ready/),
    'Open settings',
    'Source language',
    'Pick a source language to swap',
    'Target language',
    'Translate this page',
    'Pick element',
    'Translate clipboard contents',
    'Open side panel',
    'Translate something…',
  ]);
  for (const s of stops) {
    expect(s.visible, `${s.name} is focused but not visible`).toBe(true);
    expect(s.ring, `${s.name} has no visible focus ring`).toBe(true);
  }
  timeline.markStep('tab-order-checked');

  // The loop tabbed past the last stop; come back to it. Enter opens the composer and focuses it.
  await popup.locator('[data-ega-freeform-collapsed]').focus();
  await popup.keyboard.press('Enter');
  await expect(popup.locator('[data-ega-freeform-textarea]')).toBeFocused();
  timeline.markStep('composer-focused');

  await chip.focus();
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('dialog')).toBeVisible();
  await popup.keyboard.press('Escape');
  await expect(popup.getByRole('dialog')).toHaveCount(0);
  await expect(chip).toBeFocused();
  timeline.markStep('popover-closed-by-esc');
});
