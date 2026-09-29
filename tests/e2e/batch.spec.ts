import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
  pickAreasAndTranslate,
} from './helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    defaultDisplayMode: 'inline',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('page:translateAll wraps all non-English paragraphs inline', async () => {
  mockAnthropic(ext.context, { translation: 'TRANSLATED' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);

  await pickAreasAndTranslate(ext, page, ['c1', 'c2']);

  // Only the two picked paragraphs get wrapped; the rest stay untouched.
  await expect
    .poll(async () => (await egaTest<number>(page, 'inlineCount')) ?? 0, { timeout: 10_000 })
    .toBe(2);

  const c3 = await page.locator('#c3').textContent();
  expect(c3).toContain('English comment');
});

test('batch runs in inline wrappers even when displayMode is tooltip', async () => {
  // The displayMode !== 'inline' gate was cargo-cult; batch always uses
  // inline wrappers regardless of the site's tooltip default.
  await seedSettings(ext.context, ext.extensionId, { defaultDisplayMode: 'tooltip' });
  mockAnthropic(ext.context, { translation: 'TRANSLATED' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);

  await pickAreasAndTranslate(ext, page, ['c1', 'c2']);

  // Inline wrappers appear even though site displayMode is tooltip.
  await expect
    .poll(async () => (await egaTest<number>(page, 'inlineCount')) ?? 0, { timeout: 10_000 })
    .toBe(2);
});
