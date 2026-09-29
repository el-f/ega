/* coverage: translation.tooltip.drag-to-move */
import { test, expect, type Page } from '@playwright/test';
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

async function openTooltip(draggable: boolean): Promise<Page> {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipDraggable: draggable,
    tooltipClickOutside: false, // keep the tooltip alive during drag
  });
  mockAnthropic(ext.context, { translation: 'Welcome', confidence: 0.95 });
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
  return page;
}

test('tooltipDraggable=false → no is-draggable class', async () => {
  const page = await openTooltip(false);
  const hasClass = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return root?.querySelector('.tooltip')?.classList.contains('is-draggable') ?? false;
  });
  expect(hasClass).toBe(false);
});

test('tooltipDraggable=true → is-draggable class present', async () => {
  const page = await openTooltip(true);
  const hasClass = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return root?.querySelector('.tooltip')?.classList.contains('is-draggable') ?? false;
  });
  expect(hasClass).toBe(true);
});
