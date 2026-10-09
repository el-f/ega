/* coverage: translation.tooltip.open-options-link */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

// The "Open settings" CTA renders only for the codes a user can fix (AUTH / UNSUPPORTED / REQUEST / NATIVE_NOT_INSTALLED).

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
  });
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await route.fulfill({
      status: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { type: 'authentication_error', message: 'bad key' } }),
    });
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('error-card "Open settings" CTA launches the options shell', async () => {
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
          return !!root?.querySelector('.tooltip [data-ega-tooltip-error-cta]');
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
  timeline.markStep('options-button-visible');

  // One affordance, one name: no separate icon-only "Open settings" gear.
  const gearCount = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return root?.querySelectorAll('.tooltip button[aria-label="Open settings"]').length ?? 0;
  });
  expect(gearCount).toBe(0);

  // openOptionsPage surfaces as a `page` event on the context.
  const newPagePromise = ext.context.waitForEvent('page', { timeout: 5_000 });

  await page.locator('.tooltip [data-ega-tooltip-error-cta]').click();
  timeline.markStep('open-options-clicked');

  const opened = await newPagePromise;
  await opened.waitForLoadState('domcontentloaded');
  // Pin the extension id so another extension page opened by the harness cannot match.
  expect(opened.url()).toMatch(
    new RegExp(`^chrome-extension://${ext.extensionId}/src/options/`, 'i'),
  );
});
