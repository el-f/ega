/* coverage: translation.tooltip.multi-variety-cluster */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
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
    tooltipClickOutside: false,
    confidencePill: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('multi-variety detection renders the pill cluster (length>1)', async () => {
  const timeline = createTimeline();

  mockAnthropic(ext.context, {
    translation: 'Welcome',
    confidence: 0.95,
    detectedLangs: [
      { id: 'arabizi', detail: 'Levantine' },
      { id: 'en', detail: 'English' },
    ],
  });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('translate-fired');

  await waitForVisibleText(page, '.tooltip .body', 'Welcome');
  timeline.markStep('body-visible');

  const cluster = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const c = root?.querySelector('.tooltip [data-ega-multi-variety]');
    if (!c) return null;
    return {
      pillCount: c.querySelectorAll('.lang-pill').length,
    };
  });
  expect(cluster).not.toBeNull();
  expect(cluster?.pillCount).toBeGreaterThanOrEqual(2);

  // The single-variety pill must not render next to the cluster.
  const singlePillCount = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    // The direction pill shares .lang styling; only the single-variety pill must be absent.
    return root?.querySelectorAll('.tooltip .meta .lang:not([data-ega-direction])').length ?? 0;
  });
  expect(singlePillCount).toBe(0);
});
