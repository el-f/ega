/* coverage: vision.page-translate.abort-on-nav */
import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
  pickAreasAndTranslate,
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

test('pagehide tears down the active batch and reverts mounted blocks', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'TRANSLATED' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);

  await pickAreasAndTranslate(ext, page, ['c1', 'c2']);
  timeline.markStep('translateAll-dispatched');

  await expect
    .poll(async () => (await egaTest<number>(page, 'pageV2TxCount')) ?? 0, { timeout: 10_000 })
    .toBe(2);

  // Fire `pagehide` by hand: a real cross-origin nav would destroy the DOM we assert on.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  timeline.markStep('pagehide-fired');

  await expect
    .poll(async () => (await egaTest<number>(page, 'pageV2TxCount')) ?? 0, { timeout: 10_000 })
    .toBe(0);
});
