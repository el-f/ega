/* coverage: translation.tooltip.image-inline */
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
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    // Left on deliberately — the close-button assertion below only bites with it enabled.
    tooltipClickOutside: true,
    imageTranslateSurface: 'tooltip',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('image-translate result renders an <img> above the body and hides Explain', async () => {
  const timeline = createTimeline();

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  // chrome.tabs.query is extension-only, so the message goes out from an options page — sender.tab is undefined there, which passes the content script's isFromOwnBackground guard.
  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  timeline.markStep('opts-opened');

  const imageUrl = `${ext.serverUrl}/arabizi.png`;
  const handle = await sendImageTranslatePending(opts, ext.serverUrl, imageUrl);
  await sendImageTranslateResult(opts, handle, {
    translation: 'Welcome from image',
    confidence: 0.92,
  });
  timeline.markStep('result-dispatched');

  await waitForVisibleText(page, '.tooltip .body', 'Welcome from image');
  timeline.markStep('body-visible');

  const img = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const i = root?.querySelector<HTMLImageElement>('.tooltip img.tooltip-image-source');
    return i ? { src: i.getAttribute('src') ?? '' } : null;
  });
  expect(img).not.toBeNull();
  expect(img?.src).toContain('arabizi.png');

  // imageUrl present → canExplain=false.
  const explainCount = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return (
      root?.querySelectorAll('.tooltip button[aria-label="Explain this translation"]').length ?? 0
    );
  });
  expect(explainCount).toBe(0);

  // Image surfaces do not wire ontaskchange, so the topbar can collapse and take the close button with it.
  const closeAffordance = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const topbar = root?.querySelector('.tooltip .tooltip-topbar');
    const close = root?.querySelector<HTMLButtonElement>(
      '.tooltip .tooltip-topbar button.tooltip-close',
    );
    return {
      topbarMounted: !!topbar,
      closeMounted: !!close,
      closeLabel: close?.getAttribute('aria-label') ?? null,
    };
  });
  expect(closeAffordance.topbarMounted, 'topbar must render for image-translate').toBe(true);
  expect(closeAffordance.closeMounted, 'close button must render on image-translate').toBe(true);
  expect(closeAffordance.closeLabel).toBe('Close');

  // The meta row floats to the right edge, so the confidence pill can leak past the rounded corner.
  const geo = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const tooltip = root?.querySelector('.tooltip') as HTMLElement | null;
    const pill = root?.querySelector(
      '.tooltip [data-ega-meta-item="confidence"]',
    ) as HTMLElement | null;
    if (!tooltip || !pill) return null;
    const t = tooltip.getBoundingClientRect();
    const p = pill.getBoundingClientRect();
    return {
      tooltip: { left: t.left, right: t.right, top: t.top, bottom: t.bottom },
      pill: { left: p.left, right: p.right, top: p.top, bottom: p.bottom },
    };
  });
  expect(geo).not.toBeNull();
  if (!geo) throw new Error('geometry missing');
  // 0.5px slop covers sub-pixel rounding.
  expect(geo.pill.right, 'pill right edge must not exceed tooltip right edge').toBeLessThanOrEqual(
    geo.tooltip.right + 0.5,
  );
  expect(geo.pill.bottom, 'pill bottom must not exceed tooltip bottom').toBeLessThanOrEqual(
    geo.tooltip.bottom + 0.5,
  );
  expect(geo.pill.left, 'pill left must be inside tooltip').toBeGreaterThanOrEqual(
    geo.tooltip.left - 0.5,
  );
});
