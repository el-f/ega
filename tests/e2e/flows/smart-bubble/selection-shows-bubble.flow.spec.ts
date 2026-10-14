/* coverage: translation.smart-bubble.selection-shows-bubble */
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

test('eligible Arabizi selection -> smart bubble mounts in shadow host', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  timeline.markStep('page-ready');

  // The #arabizi paragraph carries digit-sandwich shapes ("mar7aba", "ta3mel") — the plain "detected" branch.
  await page.evaluate(() => {
    const el = document.getElementById('arabizi');
    if (!el) throw new Error('arabizi paragraph missing');
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

  // The label names only the target; the tooltip meta names the detected source.
  const pillText = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return root?.querySelector('.bubble')?.textContent.trim() ?? null;
  });
  expect(pillText).toBe('Translate to English');

  const steps = timeline.report();
  const bubbleStep = steps.find((s) => s.name === 'bubble-visible');
  expect(bubbleStep).toBeDefined();
  if (bubbleStep) expect(bubbleStep.ms).toBeLessThan(500);
});
