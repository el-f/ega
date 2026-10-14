/* coverage: options.tasks.default-task-change */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    defaultTask: 'translate',
    defaultTone: 'neutral',
  });
});

test.afterEach(async () => {
  await ext.close();
});

const settings = async (): Promise<Settings | undefined> =>
  (await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings')) ?? undefined;

test('default task and default tone persist from the Tasks tab', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-tasks').click();

  const taskSelect = page.locator('[data-ega-setting="defaults.defaultTask"] select');
  const toneSelect = page.locator('[data-ega-setting="defaults.defaultTone"] select');
  await expect(taskSelect).toBeVisible({ timeout: 5_000 });
  // The tone applies to any task whose prompt has {{tone}}, so it is always shown.
  await expect(toneSelect).toBeVisible();
  timeline.markStep('defaults-visible');

  await taskSelect.selectOption('reword');
  await expect.poll(async () => (await settings())?.defaultTask, { timeout: 5_000 }).toBe('reword');
  await toneSelect.selectOption('formal');
  await expect.poll(async () => (await settings())?.defaultTone, { timeout: 5_000 }).toBe('formal');
  timeline.markStep('persisted');
  timeline.report();
});
