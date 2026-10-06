/* coverage: translation.site-disable.hotkey-translate-blocked */
import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { assertStaysStable, createTimeline } from '../_harness';

const SITE_OFF_MESSAGE = 'Ega is off on ';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('the translate hotkey on a disabled site toasts and never opens a tooltip', async () => {
  const timeline = createTimeline();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    shortcut: 'Ctrl+Shift+L',
    sitePrefs: { [ext.serverUrl]: { disabled: true } },
  });
  mockAnthropic(ext.context, { translation: 'must never be requested' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await selectArabiziParagraph(page);
  timeline.markStep('selected');

  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('hotkey-pressed');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const root = document.querySelector('#ega-shadow-host')?.shadowRoot;
          return root?.querySelector('[data-ega-toast-wrap]')?.textContent.trim() ?? '';
        }),
      { timeout: 5_000 },
    )
    .toContain(SITE_OFF_MESSAGE);
  timeline.markStep('toast-shown');

  await assertStaysStable(async () => await egaTest<number>(page, 'tooltipCount'), 0, {
    windowMs: 2_000,
    message: 'a disabled site must never open a translation tooltip',
  });
  timeline.markStep('no-tooltip');
});
