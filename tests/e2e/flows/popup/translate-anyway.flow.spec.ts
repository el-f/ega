/* coverage: translation.popup.translate-anyway */
import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  onlyBackends,
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
    ...onlyBackends('anthropic'),
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('the popup names why the bubble stayed hidden, and Translate anyway opens the tooltip', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, {
    translation: 'The quick brown fox, in French.',
    detectedLang: 'en',
    confidence: 0.9,
  });
  const content = await ext.context.newPage();
  await content.goto(`${ext.serverUrl}/smart-bubble-page.html`);
  await waitForTestHooks(content);

  await content.evaluate(() => {
    const el = document.getElementById('english');
    if (!el) throw new Error('english paragraph missing');
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });
  // Smart mode holds the bubble back on English text; its first notice shows once that is recorded, and the popup asks only once.
  await expect(content.locator('#ega-shadow-host .ega-toast')).toContainText("isn't English", {
    timeout: 10_000,
  });
  expect(await egaTest<number>(content, 'bubbleCount')).toBe(0);
  timeline.markStep('held-back');

  const popup = await ext.context.newPage();
  await popup.addInitScript((url: string) => {
    const tabs = chrome.tabs;
    const real = tabs.query.bind(tabs);
    tabs.query = (async () =>
      (await real({})).filter((t) => t.url?.startsWith(url))) as typeof tabs.query;
    (window as unknown as { close: () => void }).close = () => {};
  }, ext.serverUrl);
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await expect(popup.getByText('Bubble hidden: the text looks like English.')).toBeVisible({
    timeout: 10_000,
  });
  timeline.markStep('reason-shown');

  await popup.getByRole('button', { name: 'Translate anyway' }).click();
  await expect
    .poll(async () => egaTest<number>(content, 'tooltipCount'), { timeout: 10_000 })
    .toBe(1);
  await expect
    .poll(async () => egaTest<string>(content, 'tooltipBody'), { timeout: 10_000 })
    .toContain('quick brown fox');
  timeline.markStep('tooltip-open');
});
