/* coverage: translation.tooltip.tone-switch */
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
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
    defaultTask: 'reword',
    defaultTone: 'neutral',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('tone picker switch re-runs and updates the prompt tone modifier', async () => {
  const timeline = createTimeline();
  const mock = mockAnthropic(ext.context, {
    translation: 'Welcome back',
    confidence: 0.9,
  });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('translate-fired');

  await expect.poll(() => mock.calls(), { timeout: 10_000 }).toBeGreaterThan(0);
  const firstBody = mock.lastRequestBody();
  expect(firstBody).toBeTruthy();
  expect(firstBody).toMatch(/plain neutral/);

  const callsBefore = mock.calls();

  // The tone select renders only while task === 'reword'.
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          return !!root?.querySelector('select[data-ega-tone-select]');
        }),
      { timeout: 5_000 },
    )
    .toBe(true);
  timeline.markStep('tone-select-mounted');

  // The select ignores a change the page dispatches; the hook dispatches it as the user.
  expect(await egaTest<boolean>(page, 'setTooltipSelect', 'tone:blunt')).toBe(true);
  timeline.markStep('tone-changed');

  // Exact +1 catches a double-fire where one tone change runs two translates.
  await expect.poll(() => mock.calls(), { timeout: 10_000 }).toBe(callsBefore + 1);
  const secondBody = mock.lastRequestBody();
  expect(secondBody).toBeTruthy();
  expect(secondBody).toMatch(/direct and blunt/);
  expect(secondBody).not.toMatch(/plain neutral/);
});
