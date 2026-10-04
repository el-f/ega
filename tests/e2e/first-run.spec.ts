import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  selectArabiziParagraph,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

// Runs on default settings. Seeding a mocked backend key is the only prep allowed here.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('first-run: selection shows the translate bubble on a plain page', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await selectArabiziParagraph(page);

  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);
  const label = (await egaTest<string>(page, 'bubbleLabel')) ?? '';
  expect(label).toContain('Ega');
});

test('first-run: clicking the bubble opens the tooltip with a translation', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key-xyz',
  });
  mockAnthropic(ext.context, { translation: 'Hello, how are you?' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);

  const clicked = await egaTest<boolean>(page, 'clickBubble');
  expect(clicked).toBe(true);

  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 10_000 })
    .toContain('Hello');
});

test('first-run: Ctrl+Shift+E enters element-picker mode', async () => {
  // Picker is on by default, so nothing needs seeding.
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');

  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false, { timeout: 3_000 })
    .toBe(true);
});

test('first-run: picker click captures element text and opens tooltip', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key-xyz',
  });
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');
  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false, { timeout: 3_000 })
    .toBe(true);

  await page.locator('#pick-me').click();

  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 10_000 })
    .toContain('Welcome');
});

test('first-run: popup "Side panel" button calls chrome.sidePanel.open without losing user gesture', async () => {
  // Headless Chromium never surfaces the side-panel page, so assert the gesture survives instead.
  mockAnthropic(ext.context);

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  const popup = await ext.context.newPage();
  const errors: string[] = [];
  popup.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);

  // The popup closes itself on success, so capture the call before window.close runs.
  await popup.evaluate(() => {
    const sp: unknown = (chrome as unknown as { sidePanel?: unknown }).sidePanel;
    if (!sp || typeof sp !== 'object') {
      (window as unknown as { __sp_calls?: unknown[] }).__sp_calls = [];
      return;
    }
    const calls: Array<{ tabId?: number; ts: number }> = [];
    (window as unknown as { __sp_calls: typeof calls }).__sp_calls = calls;
    const orig = (sp as { open: (o: { tabId: number }) => Promise<void> }).open.bind(sp);
    (sp as { open: (o: { tabId: number }) => Promise<void> }).open = (opts) => {
      calls.push({ tabId: opts.tabId, ts: performance.now() });
      // Reject so the popup swallows the error and stays open for the assertions.
      return Promise.reject(new Error('INTERCEPTED_BY_TEST'));
    };
    void orig;
  });

  // The popup asks for the active tab, and its own page is one: bring the content page to the
  // front first, or the handler stops at "no page to work on here" and never reaches sidePanel.
  await page.bringToFront();

  // Two buttons carry this name and share one handler, so .first() proves the gesture path.
  await popup
    .getByRole('button', { name: /open side panel/i })
    .first()
    .click();

  const calls = await popup.evaluate(
    () => (window as unknown as { __sp_calls?: Array<{ tabId?: number }> }).__sp_calls ?? [],
  );
  expect(calls.length).toBeGreaterThanOrEqual(1);
  expect(typeof calls[0]?.tabId).toBe('number');

  // A lost gesture logs "may only be called in response to a user gesture".
  const gestureErr = errors.find((m) => /user gesture/i.test(m));
  expect(gestureErr).toBeUndefined();
});
