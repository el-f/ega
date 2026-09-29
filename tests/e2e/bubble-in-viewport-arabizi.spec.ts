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
  });
  mockAnthropic(ext.context, { translation: 'the most cursed mom in the middle east' });
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

interface BubbleRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
}

test('bubble mounts inside the viewport on an Arabizi selection with an emoji', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/reddit-comments.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();

  await selectById(page, 'content-120');

  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);

  const label = await egaTest<string>(page, 'bubbleLabel');
  expect(label).toMatch(/Ega/);

  const rect = await egaTest<BubbleRect>(page, 'bubbleRect');
  expect(rect).not.toBeNull();
  if (rect) {
    // showBubble clamps left to max(8, rect.left), so a coord of exactly 8 means the math collapsed.
    expect(rect.left).toBeGreaterThan(8);
    expect(rect.top).toBeGreaterThan(8);
    expect(rect.left + rect.width).toBeLessThanOrEqual(rect.innerWidth);
    expect(rect.top + rect.height).toBeLessThanOrEqual(rect.innerHeight);
  }
});
