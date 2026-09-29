/* coverage: vision.page-translate.inline-replace-mode */
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

test('shortcut on a selection replaces the paragraph text in-place', async () => {
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

  await expect
    .poll(async () => (await egaTest<string>(page, 'inlineTextAt', 'target')) ?? '', {
      timeout: 10_000,
    })
    .toContain('Welcome');

  // No tooltip should have mounted on the inline path.
  const tooltipN = (await egaTest<number>(page, 'tooltipCount')) ?? 0;
  expect(tooltipN).toBe(0);

  // A settled revert needs intent — Esc is page-wide overloaded, so one stray press must not undo the work.
  await page.keyboard.press('Escape');
  expect(await egaTest<string>(page, 'inlineTextAt', 'target')).toContain('Welcome');

  // Second Esc inside the window confirms it.
  await page.keyboard.press('Escape');
  timeline.markStep('esc-after-settle');
  await expect
    .poll(async () => (await egaTest<string>(page, 'inlineTextAt', 'target')) ?? '', {
      timeout: 10_000,
    })
    .toContain('mar7aba');
  expect((await egaTest<number>(page, 'inlineCount')) ?? 0).toBe(0);
});
