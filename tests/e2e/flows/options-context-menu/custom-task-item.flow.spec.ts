/* coverage: options.context-menu.custom-task-item */
import { test, expect } from '@playwright/test';
import {
  customTask,
  launchExtension,
  readStorage,
  seedCustomTasks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedCustomTasks(ext.context, ext.extensionId, [customTask()]);
});

test.afterEach(async () => {
  await ext.close();
});

test('a right-click item can run a custom task', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-translate').click();
  const select = page.locator('[data-ega-cm-id="ega-translate-selection"] [data-ega-cm-task]');
  await expect(select).toBeVisible({ timeout: 5_000 });
  await expect(select.locator('option[value="c-tweet"]')).toHaveText('Tweet summary');
  await select.selectOption('c-tweet');
  await expect
    .poll(
      async () =>
        (
          await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings')
        )?.contextMenuItems.find((i) => i.id === 'ega-translate-selection'),
      { timeout: 5_000 },
    )
    .toMatchObject({ task: 'c-tweet' });
  timeline.markStep('saved');
  timeline.report();
});
