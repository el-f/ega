/* coverage: vision.image-ocr.tooltip-result-renders */
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

// The result message is sent from an extension page — same sender semantics as the real dispatchImageTranslate.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    tooltipClickOutside: false,
    imageTranslateSurface: 'tooltip',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('image-translate result mounts a tooltip with source image + translation body', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  timeline.markStep('pages-ready');

  const imageUrl = `${ext.serverUrl}/arabizi.png`;
  const handle = await sendImageTranslatePending(opts, ext.serverUrl, imageUrl);
  timeline.markStep('pending-dispatched');

  // Loading tooltip mounts immediately: image shimmer + a Cancel button.
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          const shimmer = !!root?.querySelector('.tooltip .tooltip-image-shimmer');
          const cancel = Array.from(root?.querySelectorAll('.tooltip button') ?? []).some(
            (b) => b.textContent.trim() === 'Cancel',
          );
          return shimmer && cancel;
        }),
      { timeout: 5_000 },
    )
    .toBe(true);
  timeline.markStep('loading-visible');

  await sendImageTranslateResult(opts, handle, {
    translation: 'Hello image text',
    confidence: 0.91,
  });
  timeline.markStep('dispatched');

  await waitForVisibleText(page, '.tooltip .body', 'Hello image text');

  const imgInfo = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const i = root?.querySelector<HTMLImageElement>('.tooltip img.tooltip-image-source');
    return i ? { src: i.getAttribute('src') ?? '' } : null;
  });
  expect(imgInfo).not.toBeNull();
  expect(imgInfo?.src).toContain('arabizi.png');
});
