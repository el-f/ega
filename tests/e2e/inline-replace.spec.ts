import { test, expect, type Page } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    defaultDisplayMode: 'inline',
    shortcut: 'Ctrl+Shift+L',
  });
});

test.afterEach(async () => {
  await ext.close();
});

async function selectTargetParagraph(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.getElementById('target');
    if (!el) throw new Error('target missing');
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) throw new Error('no selection');
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });
}

test('inline mode replaces the selected paragraph with the translation', async () => {
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/inline-replace-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await selectTargetParagraph(page);
  await page.keyboard.press('Control+Shift+L');

  await expect
    .poll(async () => (await egaTest<number>(page, 'inlineCount')) ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);

  await expect
    .poll(async () => (await egaTest<string>(page, 'inlineTextAt', 'target')) ?? '', {
      timeout: 10_000,
    })
    .toContain('Welcome');
});

test('Esc restores the original text while the translate is in flight', async () => {
  // Only in-flight replacements are tracked, so the Esc listener is gone once a
  // translate settles. Hold the response open to keep one in flight.
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?', delayMs: 15_000 });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/inline-replace-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await selectTargetParagraph(page);
  await page.keyboard.press('Control+Shift+L');

  await expect
    .poll(async () => (await egaTest<number>(page, 'inlineCount')) ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);

  // Send Escape at the document level — our inline renderer's listener is attached there.
  await page.keyboard.press('Escape');

  await expect
    .poll(async () => (await egaTest<number>(page, 'inlineCount')) ?? 0, { timeout: 5_000 })
    .toBe(0);

  const after = (await egaTest<string>(page, 'inlineTextAt', 'target')) ?? '';
  expect(after).toContain('mar7aba');
});

test('tooltip mode is unaffected — tooltip still opens when defaultDisplayMode=tooltip', async () => {
  await seedSettings(ext.context, ext.extensionId, { defaultDisplayMode: 'tooltip' });
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/inline-replace-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await selectTargetParagraph(page);
  await page.keyboard.press('Control+Shift+L');

  await expect
    .poll(async () => (await egaTest<number>(page, 'tooltipCount')) ?? 0, { timeout: 10_000 })
    .toBe(1);

  const inlineN = (await egaTest<number>(page, 'inlineCount')) ?? 0;
  expect(inlineN).toBe(0);
});
