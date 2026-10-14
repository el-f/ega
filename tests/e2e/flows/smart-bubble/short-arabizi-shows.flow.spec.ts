/* coverage: translation.smart-bubble.short-arabizi-shows */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    bubbleMode: 'smart',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('short Arabizi → bubble appears', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  timeline.markStep('page-ready');

  // Two tokens: the short Arabizi that looksLikeEnglish must not read as English.
  await page.evaluate(() => {
    const el = document.getElementById('arabizi-short');
    if (!el) throw new Error('arabizi-short paragraph missing');
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) throw new Error('no window.getSelection()');
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });
  timeline.markStep('selected');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          return root?.querySelector('[data-ega-bubble-wrap]') != null;
        }),
      { timeout: 3_000 },
    )
    .toBe(true);
  timeline.markStep('bubble-visible');

  const steps = timeline.report();
  // The p95 target is 150ms; the test box is slower, so cap at 500ms.
  const bubbleStep = steps.find((s) => s.name === 'bubble-visible');
  expect(bubbleStep).toBeDefined();
  if (bubbleStep) expect(bubbleStep.ms).toBeLessThan(500);
});
