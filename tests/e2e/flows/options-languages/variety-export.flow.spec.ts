/* coverage: options.languages.variety-export */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('Export languages button triggers a JSON download', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-languages').click();

  const downloadPromise = page.waitForEvent('download', { timeout: 5_000 });
  await page.locator('button', { hasText: 'Export languages' }).click();
  timeline.markStep('clicked');

  const download = await downloadPromise;
  const name = download.suggestedFilename();
  expect(name).toMatch(/^ega-varieties-\d{4}-\d{2}-\d{2}\.json$/);
});
