import { test, expect, type Page } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    defaultDisplayMode: 'tooltip',
  });
});

test.afterEach(async () => {
  await ext.close();
});

async function selectById(page: Page, id: string): Promise<void> {
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`${id} missing`);
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) throw new Error('no selection');
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  }, id);
}

test('Shift-click queues; plain-click translates all queued + current', async () => {
  const mock = mockAnthropic(ext.context, {
    translation: 'SECTION1\n\n---\n\nSECTION2',
  });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/multi-selection-page.html`);
  await waitForTestHooks(page);

  // Select #first, shift-click the bubble → queued.
  await page.locator('body').focus();
  await selectById(page, 'first');
  await expect
    .poll(async () => (await egaTest<string>(page, 'bubbleLabel')) ?? '')
    .toContain('Translate');
  const shifted = await egaTest<boolean>(page, 'shiftClickBubble');
  expect(shifted).toBe(true);

  // Select #second, expect queued badge "+1".
  await selectById(page, 'second');
  await expect
    .poll(async () => (await egaTest<string>(page, 'bubbleQueuedBadge')) ?? '')
    .toBe('+1');

  // Plain-click the new bubble.
  const clicked = await egaTest<boolean>(page, 'clickBubble');
  expect(clicked).toBe(true);

  // Tooltip opens with the concatenated translation body.
  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 10_000 })
    .toContain('SECTION1');
  const body = (await egaTest<string>(page, 'tooltipBody')) ?? '';
  expect(body).toContain('SECTION2');

  // A single backend call was made (not one per section).
  expect(mock.calls()).toBe(1);
});

test('Plain-click with empty queue behaves as single-selection', async () => {
  mockAnthropic(ext.context, { translation: 'Welcome' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/multi-selection-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await selectById(page, 'first');
  await expect
    .poll(async () => (await egaTest<string>(page, 'bubbleLabel')) ?? '')
    .toContain('Translate');
  const clicked = await egaTest<boolean>(page, 'clickBubble');
  expect(clicked).toBe(true);

  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 10_000 })
    .toContain('Welcome');
});
