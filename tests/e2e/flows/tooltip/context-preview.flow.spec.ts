/* coverage: translation.tooltip.context-preview */
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
    contextEnabled: true,
    pageContextLevel: 'minimal',
  });
  mockAnthropic(ext.context, { translation: 'Welcome' });
});

test.afterEach(async () => {
  await ext.close();
});

test('Context icon button reveals the captured PageContext entries', async () => {
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

  // ContextPreview starts closed in the tooltip variant, so the dl is absent.
  const closedListCount = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return root?.querySelectorAll('[data-ega-context-list]').length ?? 0;
  });
  expect(closedListCount).toBe(0);

  await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const btn = root?.querySelector<HTMLButtonElement>(
      '.tooltip button[aria-label="Show what was sent"]',
    );
    if (!btn) throw new Error('context toggle button missing');
    btn.click();
  });
  timeline.markStep('toggle-clicked');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          return !!root?.querySelector('[data-ega-context-list]');
        }),
      { timeout: 3_000 },
    )
    .toBe(true);

  // At minimal level the page URL is always captured, so the list is never empty.
  const entries = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const dts = Array.from(root?.querySelectorAll('[data-ega-context-list] dt') ?? []);
    return dts.map((d) => d.textContent.trim()).filter(Boolean);
  });
  expect(entries.length).toBeGreaterThan(0);
});
