/* coverage: translation.smart-bubble.bubble-latency */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';

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

test('selection → bubble visible within 500ms', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  const latencyMs = await page.evaluate(async () => {
    const t0 = performance.now();
    const el = document.getElementById('arabizi');
    if (!el) throw new Error('arabizi paragraph missing');
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) throw new Error('no window.getSelection()');
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    const deadline = t0 + 3000;
    while (performance.now() < deadline) {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      if (root?.querySelector('[data-ega-bubble-wrap]')) {
        return performance.now() - t0;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    return -1;
  });

  expect(latencyMs, 'bubble did not mount within 3000ms').toBeGreaterThan(0);
  // Loose ceiling: the real budget is p95 <= 150ms, but one CI run varies too much to assert that.
  expect(latencyMs, `latency ${latencyMs}ms exceeded 500ms budget`).toBeLessThan(500);
  console.log(`[perf:bubble] ${Math.round(latencyMs)}ms`);
});
