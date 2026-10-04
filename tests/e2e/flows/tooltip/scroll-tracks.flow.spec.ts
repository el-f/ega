/* coverage: translation.tooltip.scroll-tracks */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  mockAnthropic,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
  });
  mockAnthropic(ext.context, { translation: 'Welcome', confidence: 0.95 });
});

test.afterEach(async () => {
  await ext.close();
});

test('tooltip anchor follows selection when the page scrolls', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  // Give the page some scrollable height so scrolling actually moves content.
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.style.height = '2000px';
    document.body.appendChild(spacer);
  });

  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');

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

  const yBefore = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const tip = root?.querySelector('.tooltip') as HTMLElement | null | undefined;
    return tip ? tip.getBoundingClientRect().top : null;
  });
  expect(yBefore).not.toBeNull();

  await page.mouse.wheel(0, 200);

  // Poll the top instead of sleeping a rAF budget; 50px absorbs the debounce and any flip.
  await expect
    .poll(
      async () => {
        const yAfter = await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          const tip = root?.querySelector('.tooltip') as HTMLElement | null | undefined;
          return tip ? tip.getBoundingClientRect().top : null;
        });
        return yAfter === null ? 0 : Math.abs(yAfter - (yBefore ?? 0));
      },
      { timeout: 3_000 },
    )
    .toBeGreaterThan(50);
});
