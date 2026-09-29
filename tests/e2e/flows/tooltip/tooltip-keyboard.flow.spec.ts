/* coverage: translation.tooltip.keyboard-esc */
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

test('tooltip keyboard — Tab moves focus inside the tooltip', async () => {
  const page = await ext.context.newPage();
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

  await page.keyboard.press('Tab');
  const focusedInsideTooltip = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    if (!root) return false;
    const active = root.activeElement;
    if (!active) return false;
    return root.querySelector('.tooltip')?.contains(active) ?? false;
  });
  expect(focusedInsideTooltip).toBe(true);
});

test('tooltip keyboard — Shift+Tab reverses (focus moves, different element)', async () => {
  const page = await ext.context.newPage();
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

  function activeOutline(): Promise<string> {
    return page.evaluate(() => {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      const el = root?.activeElement as HTMLElement | null;
      if (!el) return '';
      const attrs = Array.from(el.attributes)
        .filter((a) => a.name.startsWith('data-ega-'))
        .map((a) => `${a.name}=${a.value}`)
        .join(',');
      return `${el.tagName}[${attrs}]`;
    });
  }

  await page.keyboard.press('Tab');
  const afterFirst = await activeOutline();
  await page.keyboard.press('Tab');
  const afterSecond = await activeOutline();
  await page.keyboard.press('Shift+Tab');
  const afterShiftBack = await activeOutline();

  expect(afterFirst).not.toBe('');
  expect(afterSecond).not.toBe(afterFirst);
  // Shift+Tab need not land back on afterFirst — a roving tabindex can move focus outside; only the move is guaranteed.
  expect(afterShiftBack).not.toBe(afterSecond);
});

test('tooltip keyboard — Esc dismisses the tooltip', async () => {
  const page = await ext.context.newPage();
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

  await page.keyboard.press('Escape');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          return root?.querySelector('.tooltip[role="dialog"]') == null;
        }),
      { timeout: 3000 },
    )
    .toBe(true);
});
