/* coverage: vision.image-ocr.tooltip-error-renders */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  sendImageTranslatePending,
  sendImageTranslateResult,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

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

test('image-translate error result mounts tooltip with error body', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  const imageUrl = `${ext.serverUrl}/arabizi.png`;
  const handle = await sendImageTranslatePending(opts, ext.serverUrl, imageUrl);
  await sendImageTranslateResult(opts, handle, {
    translation: '',
    confidence: 0,
    error: { code: 'NETWORK', message: 'mock network failure' },
  });
  timeline.markStep('error-dispatched');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          return root?.querySelector('.tooltip .body')?.textContent ?? '';
        }),
      { timeout: 5_000 },
    )
    .toContain('mock network failure');

  const retryCount = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return root?.querySelectorAll('.tooltip [data-ega-retry]').length ?? 0;
  });
  expect(retryCount).toBeGreaterThan(0);

  // Error state drops the thumbnail — a lazy <img> here shows as a broken-image rect.
  const errorVisuals = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const bodyEl = root?.querySelector<HTMLElement>('.tooltip .tooltip-error-body');
    const imgEl = root?.querySelector('.tooltip .tooltip-image-source');
    const dangerColor = bodyEl ? getComputedStyle(bodyEl).getPropertyValue('color').trim() : null;
    return {
      hasErrorBodyClass: !!bodyEl,
      thumbnailMounted: !!imgEl,
      dangerColor,
    };
  });
  expect(errorVisuals.hasErrorBodyClass, 'error body must wear .tooltip-error-body').toBe(true);
  expect(errorVisuals.thumbnailMounted, 'thumbnail must be hidden in error state').toBe(false);
  expect(errorVisuals.dangerColor, 'danger color token must resolve').not.toBe('');
});

function sseBody(translation: string): string {
  const json = JSON.stringify({ translation, confidence: 0.9 });
  return [
    `event: message_start`,
    `data: {"type":"message_start","message":{"id":"m1","type":"message","role":"assistant","content":[]}}`,
    ``,
    `event: content_block_delta`,
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(json)}}}`,
    ``,
    `event: message_stop`,
    `data: {"type":"message_stop"}`,
    ``,
  ].join('\n');
}

/** Asserting the button exists is what let a Retry wired to `undefined` pass for months. */
test('image error Retry re-dispatches the vision call', async () => {
  const timeline = createTimeline();
  let visionCalls = 0;
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    visionCalls += 1;
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: sseBody('Welcome, how are you?'),
    });
  });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  const imageUrl = `${ext.serverUrl}/arabizi.png`;
  const handle = await sendImageTranslatePending(opts, ext.serverUrl, imageUrl);
  await sendImageTranslateResult(opts, handle, {
    translation: '',
    error: { code: 'NETWORK', message: 'mock network failure' },
  });
  timeline.markStep('error-dispatched');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const root = document.querySelector('#ega-shadow-host')?.shadowRoot;
          return !!root?.querySelector('.tooltip [data-ega-retry]');
        }),
      { timeout: 5_000 },
    )
    .toBe(true);
  expect(visionCalls, 'no call before the click').toBe(0);

  // A real click: Retry ignores a click the page dispatches.
  await page.locator('.tooltip [data-ega-retry]').click();
  timeline.markStep('retry-clicked');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const root = document.querySelector('#ega-shadow-host')?.shadowRoot;
          return root?.querySelector('.tooltip .body')?.textContent ?? '';
        }),
      { timeout: 15_000 },
    )
    .toContain('Welcome, how are you?');
  expect(visionCalls, 'the click must reach the backend').toBe(1);
});

test('image error settings CTA opens the options page', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  const handle = await sendImageTranslatePending(
    opts,
    ext.serverUrl,
    `${ext.serverUrl}/arabizi.png`,
  );
  await sendImageTranslateResult(opts, handle, {
    translation: '',
    error: { code: 'AUTH', message: 'bad key' },
  });

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const root = document.querySelector('#ega-shadow-host')?.shadowRoot;
          return !!root?.querySelector('.tooltip [data-ega-tooltip-error-cta]');
        }),
      { timeout: 5_000 },
    )
    .toBe(true);

  // openOptionsPage focuses an already-open options tab instead of mounting a fresh one.
  await opts.close();
  const opened = ext.context.waitForEvent('page', { timeout: 10_000 });
  await page.evaluate(() => {
    const root = document.querySelector('#ega-shadow-host')?.shadowRoot;
    const btn = root?.querySelector<HTMLButtonElement>('.tooltip [data-ega-tooltip-error-cta]');
    if (!btn) throw new Error('settings CTA missing');
    btn.click();
  });

  const optionsPage = await opened;
  await optionsPage.waitForLoadState('domcontentloaded');
  expect(optionsPage.url()).toMatch(
    new RegExp(`^chrome-extension://${ext.extensionId}/src/options/`, 'i'),
  );
});
