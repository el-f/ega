/* coverage: translation.smart-bubble.digitless-arabizi-shows */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

// smart-bubble-digitless-arabizi.spec.ts checks bubbleCount; this one checks the shadow DOM.

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

test('digit-less Arabizi selection -> smart bubble mounts in shadow host', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  timeline.markStep('page-ready');

  // The fixture page ships no digit-less Arabizi, so inject a paragraph.
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'digitless-arabizi';
    p.textContent = 'yarayt rase fade add rasak';
    document.body.appendChild(p);
  });

  await page.evaluate(() => {
    const el = document.getElementById('digitless-arabizi');
    if (!el) throw new Error('digitless-arabizi paragraph missing');
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
  const bubbleStep = steps.find((s) => s.name === 'bubble-visible');
  expect(bubbleStep).toBeDefined();
  if (bubbleStep) expect(bubbleStep.ms).toBeLessThan(1500);
});
