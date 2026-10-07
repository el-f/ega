/* coverage: vision.page-translate.multi-select-toolbar */
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

async function enterMultiSelect(page: Page): Promise<void> {
  const sw = ext.context.serviceWorkers()[0];
  if (!sw) throw new Error('[e2e] no service worker');
  await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) throw new Error('no tab');
    await chrome.tabs.sendMessage(tabId, { kind: 'page:chooseAreas' });
  });
  await expect
    .poll(async () => egaTest<boolean>(page, 'msIsActive'), { timeout: 5_000 })
    .toBe(true);
}

test('the translate-areas toolbar drives picking, and the document itself is never pickable', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'TRANSLATED' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);

  await enterMultiSelect(page);
  timeline.markStep('multi-select-entered');

  const toolbar = page.locator('[data-ega-ms-wrap]');
  await expect(toolbar).toHaveCount(1);
  await expect(page.locator('[data-ega-ms-count]')).toHaveText('Click blocks to choose them');
  await expect(page.locator('[data-ega-ms-translate]')).toHaveAttribute('aria-disabled', 'true');

  // Hovering a block marks it as the pick candidate.
  await page.locator('#c1').hover();
  await expect(page.locator('[data-ega-ms-hover]')).toHaveCount(1);

  // The whole document is refused: replacing <body> in place would take the toolbar with it.
  await page.mouse.click(3, 3);
  await expect(page.locator('body[data-ega-ms-selected]')).toHaveCount(0);
  await expect(page.locator('html[data-ega-ms-selected]')).toHaveCount(0);
  await expect(toolbar).toHaveCount(1);
  timeline.markStep('document-pick-refused');

  expect(await egaTest<boolean>(page, 'msSelectById', 'c1')).toBe(true);
  expect(await egaTest<boolean>(page, 'msSelectById', 'c2')).toBe(true);
  await expect(page.locator('[data-ega-ms-count]')).toHaveText('2 areas chosen');
  await expect(page.locator('[data-ega-ms-translate]')).not.toHaveAttribute('aria-disabled');

  // The mode segments are radios that report the current choice.
  await expect(page.locator('[data-ega-ms-mode="inplace"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.locator('[data-ega-ms-mode="bilingual"]').click();
  await expect(page.locator('[data-ega-ms-mode="bilingual"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  timeline.markStep('mode-switched');

  // Exit leaves the page untouched.
  await page.locator('[data-ega-ms-exit]').click();
  await expect(toolbar).toHaveCount(0);
  await expect(page.locator('[data-ega-ms-selected]')).toHaveCount(0);
  expect((await egaTest<number>(page, 'pageV2TxCount')) ?? 0).toBe(0);
  expect(await egaTest<string>(page, 'inlineTextAt', 'c1')).toContain('mar7aba');
});

test('a second page translate keeps the settled batch, re-opens picking, and the new area joins it', async () => {
  mockAnthropic(ext.context, { translation: 'TRANSLATED' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);

  await enterMultiSelect(page);
  expect(await egaTest<boolean>(page, 'msSelectById', 'c1')).toBe(true);
  expect(await egaTest<boolean>(page, 'msFire')).toBe(true);

  await expect
    .poll(async () => (await egaTest<number>(page, 'inlineCount')) ?? 0, { timeout: 10_000 })
    .toBe(1);

  const label = (): Promise<string> =>
    page.evaluate(() => {
      const host = document.getElementById('ega-shadow-host');
      const el = host?.shadowRoot?.querySelector('[data-ega-batch-label]');
      return el ? el.textContent.trim() : '';
    });
  await expect.poll(label, { timeout: 10_000 }).toBe('Page translated to English');

  // Without closing the pill by hand, a fresh translate must re-enter picking.
  await enterMultiSelect(page);
  await expect(page.locator('[data-ega-ms-wrap]')).toHaveCount(1);
  // The first batch's translation stays on the page.
  expect((await egaTest<number>(page, 'inlineCount')) ?? 0).toBe(1);
  // The new area joins the same batch: one pill covers both, so its Remove translation puts back both.
  expect(await egaTest<boolean>(page, 'msSelectById', 'c2')).toBe(true);
  expect(await egaTest<boolean>(page, 'msFire')).toBe(true);
  await expect
    .poll(async () => (await egaTest<number>(page, 'inlineCount')) ?? 0, { timeout: 10_000 })
    .toBe(2);
  await expect(page.locator('[data-ega-batch-progress]')).toHaveCount(1);
  await expect.poll(label, { timeout: 10_000 }).toBe('Page translated to English');
});
