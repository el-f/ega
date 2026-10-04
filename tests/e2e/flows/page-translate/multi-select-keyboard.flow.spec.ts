/* coverage: vision.page-translate.multi-select-keyboard */
import { test, expect, type Page } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
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
    pageTranslateMode: 'inplace',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

const liveText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const host = document.getElementById('ega-shadow-host');
    const el = host?.shadowRoot?.querySelector('[data-ega-ms-live]');
    return el ? el.textContent.trim() : '';
  });

test('a keyboard user can move, pick and translate areas without a mouse', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'TRANSLATED' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);
  await page.bringToFront();

  const sw = ext.context.serviceWorkers()[0];
  if (!sw) throw new Error('[e2e] no service worker');
  await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) throw new Error('no tab');
    await chrome.tabs.sendMessage(tabId, { kind: 'page:translateAll' });
  });
  await expect
    .poll(async () => egaTest<boolean>(page, 'msIsActive'), { timeout: 5_000 })
    .toBe(true);
  timeline.markStep('multi-select-entered');

  // No cursor until the user asks for one.
  await expect(page.locator('[data-ega-ms-cursor]')).toHaveCount(0);

  // ArrowDown starts at the top block and walks down; the ring is what the user sees.
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-ega-ms-cursor]')).toHaveCount(1);
  await expect.poll(() => liveText(page)).not.toBe('');

  // Tab walks siblings until the cursor sits on the first comment.
  for (let i = 0; i < 6; i++) {
    if ((await page.locator('#c1[data-ega-ms-cursor]').count()) === 1) break;
    await page.keyboard.press('Tab');
  }
  await expect(page.locator('#c1[data-ega-ms-cursor]')).toHaveCount(1);
  await expect.poll(() => liveText(page)).toContain('mar7aba');
  timeline.markStep('cursor-on-c1');

  // Space picks it, and the announcement says so.
  await page.keyboard.press('Space');
  await expect(page.locator('#c1[data-ega-ms-selected]')).toHaveCount(1);
  await expect.poll(() => liveText(page)).toContain('1 area selected');

  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-ega-ms-selected]')).toHaveCount(2);

  // Enter fires the batch.
  await page.keyboard.press('Enter');
  timeline.markStep('translate-fired');
  await expect
    .poll(async () => (await egaTest<number>(page, 'inlineCount')) ?? 0, { timeout: 10_000 })
    .toBe(2);
  await expect(page.locator('[data-ega-ms-cursor]')).toHaveCount(0);
});

test('Escape leaves translate-areas mode from the keyboard and clears the cursor', async () => {
  mockAnthropic(ext.context, { translation: 'TRANSLATED' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);
  await page.bringToFront();

  const sw = ext.context.serviceWorkers()[0];
  if (!sw) throw new Error('[e2e] no service worker');
  await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) throw new Error('no tab');
    await chrome.tabs.sendMessage(tabId, { kind: 'page:translateAll' });
  });
  await expect
    .poll(async () => egaTest<boolean>(page, 'msIsActive'), { timeout: 5_000 })
    .toBe(true);

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-ega-ms-cursor]')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect
    .poll(async () => egaTest<boolean>(page, 'msIsActive'), { timeout: 5_000 })
    .toBe(false);
  await expect(page.locator('[data-ega-ms-cursor]')).toHaveCount(0);
  expect((await egaTest<number>(page, 'pageV2TxCount')) ?? 0).toBe(0);
});
