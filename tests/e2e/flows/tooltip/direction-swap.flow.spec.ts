/* coverage: translation.tooltip.direction-swap */
import { test, expect } from '@playwright/test';
import {
  egaTest,
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
  // A concrete source is required — the swap button is disabled while source is 'auto'.
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
    defaultLang: 'en',
    defaultTargetLang: 'es',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('swap button reverses source<->target and re-fires translate', async () => {
  const timeline = createTimeline();
  const mock = mockAnthropic(ext.context, {
    translation: 'Hola, ¿cómo estás?',
    confidence: 0.9,
  });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('translate-fired');

  await waitForVisibleText(page, '.tooltip .body', 'Hola');
  timeline.markStep('body-visible');

  const callsBefore = mock.calls();
  const firstBody = mock.lastRequestBody() ?? '';
  // First call: en→es, target label "Spanish".
  expect(firstBody).toContain('Spanish');

  // The meta row shows the active pair, so the swap has a visible readout.
  expect(await egaTest<string>(page, 'tooltipDirection')).toBe('English → Spanish');

  // A real click: the swap button ignores a click the page dispatches.
  await page.locator('.tooltip button[aria-label="Swap direction"]').click();
  timeline.markStep('swap-clicked');

  await expect.poll(() => mock.calls(), { timeout: 10_000 }).toBeGreaterThan(callsBefore);
  const secondBody = mock.lastRequestBody() ?? '';
  // Swapped direction (es → en): target label is now "English".
  expect(secondBody).toContain('English');

  // The pill flips with the swap.
  await expect
    .poll(async () => await egaTest<string>(page, 'tooltipDirection'), { timeout: 10_000 })
    .toBe('Spanish → English');
});
