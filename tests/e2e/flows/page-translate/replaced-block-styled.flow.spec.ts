/* coverage: vision.page-translate.replaced-block-styled */
import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
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
    defaultDisplayMode: 'inline',
    shortcut: 'Ctrl+Shift+L',
  });
});

test.afterEach(async () => {
  await ext.close();
});

/** The wrapper is created in the page DOM, so only a page-level sheet can style it. */
test('a replaced block gets its styling from the page-level sheet', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/inline-replace-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
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
  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('shortcut-fired');

  await expect
    .poll(async () => (await egaTest<number>(page, 'inlineCount')) ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);

  const wrapper = page.locator('[data-ega-replaced]').first();
  await wrapper.waitFor({ state: 'attached', timeout: 10_000 });

  const styles = await wrapper.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      background: cs.backgroundColor,
      borderBottomStyle: cs.borderBottomStyle,
      borderBottomWidth: cs.borderBottomWidth,
      cursor: cs.cursor,
    };
  });

  // Unstyled is the defect: transparent background, no border. No help cursor: a hover hint is meaning a keyboard user never gets.
  expect(styles.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(styles.borderBottomStyle).toBe('dashed');
  expect(styles.borderBottomWidth).toBe('1px');
  expect(styles.cursor).not.toBe('help');

  const sheetCount = await page.locator('style#ega-page-styles').count();
  expect(sheetCount).toBe(1);
});
