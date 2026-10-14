/* coverage: translation.tooltip.inline-replace */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  mockAnthropic,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

// inline-replace.spec.ts covers the inline mechanics; this flow only guards that no tooltip mounts.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    defaultDisplayMode: 'inline',
  });
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
});

test.afterEach(async () => {
  await ext.close();
});

test('inline mode swaps the paragraph text and no tooltip mounts', async () => {
  const timeline = createTimeline();
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
  timeline.markStep('translate-fired');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const el = document.getElementById('target');
          return el?.textContent ?? '';
        }),
      { timeout: 10_000 },
    )
    .toContain('Welcome, how are you?');
  timeline.markStep('paragraph-swapped');

  const tooltipCount = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return root?.querySelectorAll('.tooltip[role="dialog"]').length ?? 0;
  });
  expect(tooltipCount).toBe(0);
});
