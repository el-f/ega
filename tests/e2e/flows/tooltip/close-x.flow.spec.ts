/* coverage: translation.tooltip.close-x */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  mockAnthropic,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false, // the ✕ renders only when click-outside dismiss is off
  });
  mockAnthropic(ext.context, { translation: 'Welcome' });
});

test.afterEach(async () => {
  await ext.close();
});

test('top-right ✕ dismisses the tooltip', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('translate-fired');

  // Tooltip mounts.
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          return root?.querySelector('.tooltip[role="dialog"]') != null;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
  timeline.markStep('tooltip-mounted');

  // Click the top-right ✕ (class `tooltip-close`). The in-row close
  // button is hidden in success mode; only the topbar ✕ is reachable.
  await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const btn = root?.querySelector<HTMLButtonElement>('.tooltip-close');
    if (!btn) throw new Error('top-right ✕ missing');
    btn.click();
  });
  timeline.markStep('close-clicked');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          return root?.querySelector('.tooltip[role="dialog"]') == null;
        }),
      { timeout: 3_000 },
    )
    .toBe(true);
});
