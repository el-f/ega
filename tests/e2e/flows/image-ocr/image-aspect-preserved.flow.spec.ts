/* coverage: vision.image-ocr.image-aspect-preserved */
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

test('rendered source image aspect matches the natural source aspect', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  const imageUrl = `${ext.serverUrl}/arabizi.png`;
  const handle = await sendImageTranslatePending(opts, ext.serverUrl, imageUrl);
  await sendImageTranslateResult(opts, handle, {
    translation: 'Aspect-preserved',
    confidence: 0.9,
  });
  timeline.markStep('dispatched');

  await waitForVisibleText(page, '.tooltip .body', 'Aspect-preserved');

  // `naturalWidth/Height` stay 0 until the image finishes loading.
  const dims = await page.evaluate(async () => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const img = root?.querySelector<HTMLImageElement>('.tooltip img.tooltip-image-source');
    if (!img) return null;
    if (!img.complete) {
      await new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });
    }
    const rect = img.getBoundingClientRect();
    return {
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      renderedW: rect.width,
      renderedH: rect.height,
    };
  });
  expect(dims).not.toBeNull();
  if (!dims) throw new Error('image dims missing');
  expect(dims.naturalW).toBeGreaterThan(0);
  expect(dims.naturalH).toBeGreaterThan(0);
  expect(dims.renderedW).toBeGreaterThan(0);
  expect(dims.renderedH).toBeGreaterThan(0);

  const naturalRatio = dims.naturalW / dims.naturalH;
  const renderedRatio = dims.renderedW / dims.renderedH;
  // Allow 2% drift to absorb fractional-pixel rounding.
  const driftPct = Math.abs(renderedRatio - naturalRatio) / naturalRatio;
  expect(driftPct).toBeLessThan(0.02);
});
