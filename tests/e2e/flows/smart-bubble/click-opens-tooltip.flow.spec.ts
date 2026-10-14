/* coverage: translation.smart-bubble.click-opens-tooltip */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { assertRequestShape, createTimeline, waitForVisibleText } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    bubbleMode: 'smart',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('clicking the smart bubble opens the translation tooltip', async () => {
  const mock = mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  timeline.markStep('page-ready');

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
          return root?.querySelector('[data-ega-bubble-wrap] button.bubble') != null;
        }),
      { timeout: 3_000 },
    )
    .toBe(true);
  timeline.markStep('bubble-visible');

  // A real click: the bubble ignores a click the page dispatches.
  await page.locator('[data-ega-bubble-wrap] button.bubble').click();
  timeline.markStep('bubble-clicked');

  await waitForVisibleText(page, '.tooltip .body', 'Welcome, how are you?');
  timeline.markStep('tooltip-visible');

  const steps = timeline.report();
  const tipStep = steps.find((s) => s.name === 'tooltip-visible');
  expect(tipStep).toBeDefined();

  // Regex form: the target language sits inside generated prompt text, not a fixed field.
  assertRequestShape(mock, /(target|to)[^a-z]*en/i);
});
