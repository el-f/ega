/* coverage: translation.tooltip.inspector-drawer */
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
    captureResultMeta: true,
  });
  mockAnthropic(ext.context, { translation: 'Welcome', confidence: 0.9 });
});

test.afterEach(async () => {
  await ext.close();
});

test('Inspector ⓘ button opens the InspectorDrawer with backend/latency rows', async () => {
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

  const closed = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return root?.querySelectorAll('[data-ega-inspector]').length ?? 0;
  });
  expect(closed).toBe(0);

  // The ⓘ button only renders when meta has landed; poll for it.
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          return !!root?.querySelector(
            '.tooltip button[aria-label="Show details about this reply"]',
          );
        }),
      { timeout: 5_000 },
    )
    .toBe(true);

  await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const btn = root?.querySelector<HTMLButtonElement>(
      '.tooltip button[aria-label="Show details about this reply"]',
    );
    if (!btn) throw new Error('inspector toggle missing');
    btn.click();
  });
  timeline.markStep('inspector-toggle-clicked');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          return !!root?.querySelector('[data-ega-inspector]');
        }),
      { timeout: 3_000 },
    )
    .toBe(true);

  const labels = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return Array.from(root?.querySelectorAll('[data-ega-inspector] dt') ?? [])
      .map((d) => d.textContent.trim())
      .filter(Boolean);
  });
  expect(labels).toContain('Answered by');
  expect(labels).toContain('Time');
  expect(labels).toContain('Your text');
});
