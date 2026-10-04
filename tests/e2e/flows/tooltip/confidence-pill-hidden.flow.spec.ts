/* coverage: translation.tooltip.confidence-pill-hidden */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  mockAnthropic,
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
    confidencePillThreshold: 0.8,
  });
  mockAnthropic(ext.context, { translation: 'Welcome', confidence: 0.4 });
});

test.afterEach(async () => {
  await ext.close();
});

test('confidence pill hidden when confidence < threshold', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('translate-fired');

  await waitForVisibleText(page, '.tooltip .body', 'Welcome');
  timeline.markStep('body-visible');

  const pillCount = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return root?.querySelectorAll('.tooltip .meta .pill').length ?? 0;
  });
  expect(pillCount).toBe(0);
});
