import { test, expect, type Page } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

let ext: ExtensionHandle;

async function openPageAndTooltip(): Promise<{ page: Page }> {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');

  // Wait for the streamed translation to land.
  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 10_000 })
    .toContain('Welcome');
  return { page };
}

test.beforeEach(async () => {
  ext = await launchExtension();
  await ext.context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    tooltipClickOutside: true,
    contextEnabled: false,
    shortcut: 'Ctrl+Shift+L',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Explain button fires a second translate request and keeps tooltip open', async () => {
  const mock = mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
  const { page } = await openPageAndTooltip();

  const initialCalls = mock.calls();
  expect(initialCalls).toBeGreaterThanOrEqual(1);

  const clicked = await egaTest<boolean>(page, 'clickAction', 'explain');
  expect(clicked).toBe(true);

  // Tooltip remains mounted (Explain flow swaps in a fresh tooltip with a new
  // id; the count should still be at least 1, not 0).
  await expect
    .poll(async () => (await egaTest<number>(page, 'tooltipCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(1);

  // Anthropic was hit again for the explain request.
  await expect.poll(() => mock.calls(), { timeout: 5_000 }).toBeGreaterThan(initialCalls);
});

test('clicking tooltip buttons does not dismiss via the outside-click handler', async () => {
  // The tooltip lives in a closed shadow root: its own buttons count as inside, or Copy/Explain would act as Close.
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
  const { page } = await openPageAndTooltip();

  for (const label of ['copy', 'explain']) {
    // Re-wait for body after Explain (which reopens under a new request id).
    await expect
      .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 5_000 })
      .toContain('Welcome');

    const before = (await egaTest<number>(page, 'tooltipCount')) ?? 0;
    expect(before).toBeGreaterThanOrEqual(1);

    const clicked = await egaTest<boolean>(page, 'clickAction', label);
    expect(clicked).toBe(true);

    // Tooltip is still mounted.
    const after = (await egaTest<number>(page, 'tooltipCount')) ?? 0;
    expect(after).toBeGreaterThanOrEqual(1);
  }
});
