/* coverage: vision.page-translate.inplace-mode-opt-in */
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
    pageTranslateMode: 'inplace',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('inplace mode replaces each non-English block in place', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'TRANSLATED' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);

  await pickAreasAndTranslate(ext, page, ['c1', 'c2']);
  timeline.markStep('translateAll-dispatched');

  await expect
    .poll(async () => (await egaTest<number>(page, 'inlineCount')) ?? 0, { timeout: 10_000 })
    .toBe(2);

  // No bilingual siblings inserted in in-place mode.
  expect((await egaTest<number>(page, 'pageV2TxCount')) ?? 0).toBe(0);
});
