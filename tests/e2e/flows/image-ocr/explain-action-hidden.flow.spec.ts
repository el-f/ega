/* coverage: vision.image-ocr.explain-action-hidden */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  sendImageTranslatePending,
  sendImageTranslateResult,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline, waitForVisibleText } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    tooltipClickOutside: false,
    imageTranslateSurface: 'tooltip',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Explain action is hidden on image-translate tooltips', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  const imageUrl = `${ext.serverUrl}/arabizi.png`;
  const handle = await sendImageTranslatePending(opts, ext.serverUrl, imageUrl);
  await sendImageTranslateResult(opts, handle, {
    translation: 'No explain here',
    confidence: 0.9,
  });
  timeline.markStep('dispatched');

  await waitForVisibleText(page, '.tooltip .body', 'No explain here');

  const explainCount = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return (
      root?.querySelectorAll('.tooltip button[aria-label="Explain this translation"]').length ?? 0
    );
  });
  expect(explainCount).toBe(0);
});
