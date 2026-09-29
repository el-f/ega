/* coverage: vision.page-translate.bilingual-default */
import { test, expect } from '@playwright/test';
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
    pageTranslateMode: 'bilingual',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('bilingual mode inserts a marked sibling under each area the user picked', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'TRANSLATED' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);

  const sw = ext.context.serviceWorkers()[0];
  if (!sw) throw new Error('no service worker');
  await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) throw new Error('no tab');
    await chrome.tabs.sendMessage(tabId, { kind: 'page:translateAll' });
  });
  timeline.markStep('multi-select-entered');

  await expect
    .poll(async () => egaTest<boolean>(page, 'msIsActive'), { timeout: 5_000 })
    .toBe(true);

  // Nothing translates until the user picks areas.
  expect(await egaTest<boolean>(page, 'msSelectById', 'c1')).toBe(true);
  expect(await egaTest<boolean>(page, 'msSelectById', 'c2')).toBe(true);
  expect(await egaTest<number>(page, 'msSelectedCount')).toBe(2);
  expect(await egaTest<number>(page, 'pageV2TxCount')).toBe(0);
  timeline.markStep('areas-picked');

  expect(await egaTest<boolean>(page, 'msFire')).toBe(true);
  timeline.markStep('translate-fired');

  await expect
    .poll(async () => (await egaTest<number>(page, 'pageV2TxCount')) ?? 0, { timeout: 10_000 })
    .toBe(2);

  // An unpicked block stays untouched — the point of picking.
  expect(await egaTest<string>(page, 'pageV2TxTextAt', 'c4')).toBeNull();

  const original = await egaTest<string>(page, 'inlineTextAt', 'c1');
  expect(original).toContain('mar7aba');

  // Inserted siblings carry a visible marker so readers can tell them from the author's text.
  const sibling = page.locator('[data-ega-tx]').first();
  const styles = await sibling.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { borderLeftWidth: cs.borderLeftWidth, borderLeftStyle: cs.borderLeftStyle };
  });
  expect(styles.borderLeftStyle).toBe('solid');
  expect(styles.borderLeftWidth).toBe('2px');
});
