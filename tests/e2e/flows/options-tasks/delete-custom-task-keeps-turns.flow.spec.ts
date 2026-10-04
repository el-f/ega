/* coverage: options.tasks.delete-custom-task-keeps-turns */
import { test, expect } from '@playwright/test';
import {
  customTask,
  launchExtension,
  mockAnthropic,
  readStorage,
  seedCustomTasks,
  seedSettings,
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
  const chip = panel.locator('[data-ega-task="c-tweet"]');
  await expect(chip).toBeVisible({ timeout: 5_000 });
  await chip.click();
  await panel.locator('#sp-text').fill('a long thread');
  await panel.getByRole('button', { name: /^Tweet summary$/ }).click();
  await expect(panel.locator('.ega-assistant-turn')).toContainText('Short tweet', {
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

  await expect(panel.locator('[data-ega-task="c-tweet"]')).toHaveCount(0, { timeout: 5_000 });
  await expect(panel.locator('.ega-assistant-turn')).toContainText('Short tweet');
  await expect(panel.locator('.ega-user-turn').first()).toContainText('Deleted task');
  timeline.markStep('turns-kept');
  timeline.report();
});
