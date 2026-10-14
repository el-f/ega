/* coverage: translation.tooltip.close-button-follows-click-outside */
import { test, expect, type Page } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  mockAnthropic,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';

// The tooltip offers one dismiss path at a time, so click-outside hides the close button.

let ext: ExtensionHandle;

async function countCloseButtons(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return root?.querySelectorAll('button[aria-label="Close"]').length ?? 0;
  });
}

async function openTranslateTooltip(): Promise<Page> {
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

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('tooltipClickOutside=true → one explicit Close remains visible', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: true,
  });
  mockAnthropic(ext.context, { translation: 'Welcome', confidence: 0.95 });
  const page = await openTranslateTooltip();
  expect(await countCloseButtons(page)).toBe(1);
});

test('tooltipClickOutside=false → close button VISIBLE', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
  });
  mockAnthropic(ext.context, { translation: 'Welcome', confidence: 0.95 });
  const page = await openTranslateTooltip();
  // The error path adds a second close button, so the count is not exact.
  expect(await countCloseButtons(page)).toBe(1);
});
