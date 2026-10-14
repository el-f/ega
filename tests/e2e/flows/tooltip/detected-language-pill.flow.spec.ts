/* coverage: translation.tooltip.detected-language-pill */
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
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('a single detected language renders one pill with its detail', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, {
    translation: 'Welcome',
    detectedLang: 'arabizi',
    detectedDetail: 'Levantine',
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

  // The preset label from the id, then the model's detail.
  const pill = page.locator('.tooltip [data-ega-meta-item="direction"]');
  await expect(pill).toHaveCount(1);
  await expect(pill).toHaveText('Arabizi (Levantine) → English');
  await expect(pill).not.toHaveAttribute('title');
  await expect(page.locator('.tooltip [data-ega-multi-variety]')).toHaveCount(0);
  timeline.markStep('pill-visible');
});
