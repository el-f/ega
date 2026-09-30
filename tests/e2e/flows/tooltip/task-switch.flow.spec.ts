/* coverage: translation.tooltip.task-switch */
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

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
  });
  // Slow the mock so the loading label stays visible long enough to assert.
  mockAnthropic(ext.context, {
    translation: 'Welcome',
    confidence: 0.95,
    delayMs: 400,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('task picker switch — tooltip stays anchored + loading label flips', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          const tip = root?.querySelector('.tooltip');
          return tip?.textContent.includes('Welcome') === true;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);

  const rectBefore = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const tip = root?.querySelector('.tooltip') as HTMLElement | null | undefined;
    return tip
      ? { top: tip.getBoundingClientRect().top, left: tip.getBoundingClientRect().left }
      : null;
  });
  expect(rectBefore).not.toBeNull();

  // Playwright's selectOption cannot reach into a shadow root, and the select ignores a change the page dispatches.
  expect(await egaTest<boolean>(page, 'setTooltipSelect', 'task:explain')).toBe(true);

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          const label = root?.querySelector('.shimmer-label');
          return label?.textContent ?? '';
        }),
      { timeout: 3000 },
    )
    .toBe('Explaining…');

  const rectDuring = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const tip = root?.querySelector('.tooltip') as HTMLElement | null | undefined;
    return tip
      ? { top: tip.getBoundingClientRect().top, left: tip.getBoundingClientRect().left }
      : null;
  });
  expect(rectDuring).not.toBeNull();
  // The tooltip re-measures the Range rect on task change, so allow a small reposition and rAF drift.
  expect(Math.abs((rectDuring?.top ?? 0) - (rectBefore?.top ?? 0))).toBeLessThan(40);
  expect(Math.abs((rectDuring?.left ?? 0) - (rectBefore?.left ?? 0))).toBeLessThan(40);
});
