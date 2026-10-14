/* coverage: options.tasks.page-context-off-drops-context */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

const BASE = {
  anthropicApiKey: 'test-key',
  shortcut: 'Ctrl+Shift+L',
  tooltipClickOutside: false,
  cacheEnabled: false,
};

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

async function translateSelection(): Promise<void> {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
}

test('Translate with page context switched off sends no page context to the backend', async () => {
  const timeline = createTimeline();
  const mock = mockAnthropic(ext.context, { translation: 'Hello', confidence: 0.9 });

  await seedSettings(ext.context, ext.extensionId, BASE);
  await translateSelection();
  await expect.poll(() => mock.calls(), { timeout: 10_000 }).toBe(1);
  expect(mock.lastRequestBody()).toContain('Ega E2E Selection Fixture');
  timeline.markStep('context-on');

  await seedSettings(ext.context, ext.extensionId, {
    ...BASE,
    taskOverrides: { translate: { pageContext: false } },
  });
  await translateSelection();
  await expect.poll(() => mock.calls(), { timeout: 10_000 }).toBe(2);
  expect(mock.lastRequestBody()).not.toContain('Ega E2E Selection Fixture');
  timeline.markStep('context-off');
  timeline.report();
});
