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

  // The details panel starts closed, so the page excerpt is absent.
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
      '.tooltip button[aria-label="Show details about this reply"]',
    );
    if (!btn) throw new Error('details button missing');
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

  // At minimal level the text around the selection is captured, with the selection marked in it.
  const marked = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return root?.querySelector('[data-ega-context-list] mark')?.textContent ?? '';
  });
  expect(marked.length).toBeGreaterThan(0);

  // Every page field opens on request, the full address among them.
  const allFields = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const more = Array.from(
      root?.querySelectorAll<HTMLButtonElement>('[data-ega-inspector] .rd-link') ?? [],
    ).find((b) => b.textContent.trim() === 'Show all page info');
    more?.click();
    return new Promise<string>((resolve) =>
      setTimeout(
        () => resolve(root?.querySelector('[data-ega-context-all]')?.textContent ?? ''),
        100,
      ),
    );
  });
  expect(allFields).toContain('Address');
});
