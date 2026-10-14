/* coverage: translation.tooltip.theme-respects */
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
});

test.afterEach(async () => {
  await ext.close();
});

async function openTooltipWithTheme(theme: 'light' | 'dark'): Promise<string> {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
    theme,
  });
  mockAnthropic(ext.context, { translation: 'Welcome', confidence: 0.95 });
  const page = await ext.context.newPage();
  // Pin the OS scheme to the opposite theme, so only data-theme can drive the result.
  await page.emulateMedia({ colorScheme: theme === 'dark' ? 'light' : 'dark' });
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
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
  // An empty attribute means initTheme never fired — fail here, not on the color compare.
  const hostTheme = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host') as HTMLElement | null;
    return host?.dataset['theme'] ?? '';
  });
  expect(hostTheme).toBe(theme);
  const bg = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const tip = root?.querySelector('.tooltip') as HTMLElement | null | undefined;
    if (!tip) return '';
    return window.getComputedStyle(tip).backgroundColor;
  });
  return bg;
}

test('tooltip background differs between light and dark themes (tokens applied)', async () => {
  const dark = await openTooltipWithTheme('dark');
  await ext.close();
  ext = await launchExtension();
  const light = await openTooltipWithTheme('light');
  expect(dark).toMatch(/^rgba?\(/);
  expect(light).toMatch(/^rgba?\(/);
  // Equal backgrounds mean a hardcoded literal, or prefers-color-scheme beating [data-theme].
  expect(dark).not.toBe(light);
});
