/* coverage: translation.popup.keyboard-tab-order */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  onlyBackends,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
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
  // The popup over a website tab, as the toolbar button opens it: the site switch is part of the order.
  const url = `${ext.serverUrl}/selection-page.html`;
  const content = await ext.context.newPage();
  await content.goto(url);
  await waitForTestHooks(content);
  const host = new URL(url).hostname;
  const popup = await ext.context.newPage();
  await popup.addInitScript((pageUrl: string) => {
    const tabs = chrome.tabs;
    const real = tabs.query.bind(tabs);
    tabs.query = (async () =>
      (await real({})).filter((t) => t.url?.startsWith(pageUrl))) as typeof tabs.query;
  }, url);
  await popup.setViewportSize({ width: 380, height: 600 });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await expect(popup.getByRole('switch', { name: `Ega on ${host}` })).toBeVisible();
  const chip = popup.locator('.active-backend-chip');
  await expect(chip).toHaveAttribute('aria-label', /^Anthropic is ready/, {
    timeout: 5_000,
  });
  timeline.markStep('popup-ready');

  // Nothing is prefilled, so the popup opens with focus on its main action.
  await expect(popup.getByRole('button', { name: 'Translate page' })).toBeFocused();
  // Walk from the first stop: Chromium resumes Tab from wherever focus last was.
  await chip.focus();
  const first = await readFocus(popup);
  const stops: FocusStop[] = first ? [first] : [];
  for (let i = 0; i < 15; i++) {
    await popup.keyboard.press('Tab');
    const stop = await readFocus(popup);
    if (stop === null) break;
    stops.push(stop);
  }
  // Swap is hidden while the source is auto; the four page tools are one stop.
  expect(stops.map((s) => s.name)).toEqual([
    expect.stringMatching(/^Anthropic is ready/),
    'Open settings',
    `Ega on ${host}`,
    'Source language',
    'Target language',
    'Translate page',
    'Choose areas',
    'ega-popup-freeform',
    'Translate',
  ]);
  for (const s of stops) {
    expect(s.visible, `${s.name} is focused but not visible`).toBe(true);
    expect(s.ring, `${s.name} has no visible focus ring`).toBe(true);
  }
  timeline.markStep('tab-order-checked');

  // Down moves inside the tools list.
  await popup.getByRole('button', { name: 'Choose areas' }).focus();
  await popup.keyboard.press('ArrowDown');
  await expect(popup.getByRole('button', { name: 'Pick element' })).toBeFocused();
  timeline.markStep('tools-arrow-key');

  await chip.focus();
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('dialog')).toBeVisible();
  await popup.keyboard.press('Escape');
  await expect(popup.getByRole('dialog')).toHaveCount(0);
  await expect(chip).toBeFocused();
  timeline.markStep('popover-closed-by-esc');
});
