/* example: enforceBudget + assertRequestShape — selection → bubble + request shape */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline, enforceBudget, assertRequestShape } from '../_harness';

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

test('selection → bubble paint stays under 500ms; promote sends a translate request', async () => {
  const route = mockAnthropic(ext.context, { translation: 'Hello, friend' });
  const timeline = createTimeline();

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  timeline.markStep('page-loaded');

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
      if (root?.querySelector('[data-ega-bubble-wrap]')) return performance.now() - t0;
      await new Promise((r) => setTimeout(r, 10));
    }
    return -1;
  });
  expect(latencyMs, 'bubble did not mount within 3000ms').toBeGreaterThan(0);
  // enforceBudget reads timeline.report(), so the in-page measurement is pushed there.
  timeline.report().push({ name: 'bubble-paint', ms: Math.round(latencyMs) });
  enforceBudget(timeline, { 'bubble-paint': 500 });

  // Seed the key only after the bubble mounts, so the bubble click promotes to a real translate.
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
  });

  // A real click: the bubble ignores a click the page dispatches.
  await page.locator('[data-ega-bubble-wrap] button.bubble').click();

  await expect.poll(() => route.calls(), { timeout: 5_000 }).toBeGreaterThan(0);

  // Regex form: the target language sits inside generated prompt text, not a fixed field.
  assertRequestShape(route, /(target|to)[^a-z]*en/i);
});
