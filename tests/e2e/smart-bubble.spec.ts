import { test, expect, type Page } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

// Own fixture: the suppression tests need the english / arabizi / mixed paragraphs in smart-bubble-page.html.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
  });
  // The bubbleMode=never test translates via the hotkey and expects this mocked 'Welcome'.
  mockAnthropic(ext.context, { translation: 'Welcome' });
});

test.afterEach(async () => {
  await ext.close();
});

async function selectById(page: Page, id: string): Promise<void> {
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`${id} missing`);
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) throw new Error('no selection');
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  }, id);
}

async function clearSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });
}

test('default (smart): English paragraph suppresses bubble; arabizi shows it', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/smart-bubble-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();

  // Select English — bubble should NOT appear.
  await selectById(page, 'english');
  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? -1, { timeout: 1_500 })
    .toBe(0);

  // Now select arabizi — bubble SHOULD appear.
  await clearSelection(page);
  await selectById(page, 'arabizi');
  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);
});

test('default (smart): mixed Arabizi+Latin with a single digit-word still shows the bubble', async () => {
  // One Arabizi-shaped word (e5wet) in an English sentence must still show the bubble.
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/smart-bubble-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();

  await selectById(page, 'mixed');
  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);
});

test('bubbleMode=always: English paragraph shows the bubble', async () => {
  await seedSettings(ext.context, ext.extensionId, { bubbleMode: 'always' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/smart-bubble-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();

  await selectById(page, 'english');
  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);
});

test('bubbleMode=never: arabizi does NOT show bubble but Ctrl+Shift+L still translates', async () => {
  await seedSettings(ext.context, ext.extensionId, { bubbleMode: 'never' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/smart-bubble-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();

  await selectById(page, 'arabizi');
  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? -1, { timeout: 1_500 })
    .toBe(0);

  // Hotkey must still reach the tooltip.
  await page.keyboard.press('Control+Shift+L');
  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 10_000 })
    .toContain('Welcome');
});
