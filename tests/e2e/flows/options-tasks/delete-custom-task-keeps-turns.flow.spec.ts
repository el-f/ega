/* coverage: options.tasks.delete-custom-task-keeps-turns */
import { test, expect } from '@playwright/test';
import {
  customTask,
  launchExtension,
  mockAnthropic,
  readStorage,
  seedCustomTasks,
  seedSettings,
  sendFromPanel,
  setNextMessage,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'test-key' });
  await seedCustomTasks(ext.context, ext.extensionId, [customTask()]);
});

test.afterEach(async () => {
  await ext.close();
});

test('deleting a custom task keeps its past answers and names them "Deleted task"', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Short tweet', confidence: 0.9 });
  const panel = await ext.context.newPage();
  await panel.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await setNextMessage(panel, { task: 'c-tweet' });
  await sendFromPanel(panel, 'a long thread');
  await expect(panel.locator('[data-ega-reply]')).toContainText('Short tweet', {
    timeout: 10_000,
  });
  timeline.markStep('answered');

  const options = await ext.context.newPage();
  await options.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await options.locator('#tab-tasks').click();
  await options.locator('[data-ega-task-edit="c-tweet"]').click();
  await options.locator('[data-ega-custom-task-delete]').click();
  await options.getByRole('button', { name: 'Delete', exact: true }).last().click();
  await expect
    .poll(
      async () =>
        (await readStorage<unknown[]>(ext.context, ext.extensionId, 'ega.customTasks')) ?? [],
      { timeout: 5_000 },
    )
    .toEqual([]);
  timeline.markStep('deleted');

  // The task leaves the Next message picker; its past answer stays.
  await panel.locator('[data-ega-mode-chip]').click();
  const picker = panel.locator('[data-ega-mode-popover]');
  await expect(picker.locator('[data-ega-task="translate"]')).toBeVisible();
  await expect(picker.locator('[data-ega-task="c-tweet"]')).toHaveCount(0, { timeout: 5_000 });
  await panel.keyboard.press('Escape');
  await expect(panel.locator('[data-ega-reply]')).toContainText('Short tweet');
  await expect(panel.locator('.ega-user-turn').first()).toContainText('Deleted task');
  timeline.markStep('turns-kept');
  timeline.report();
});
