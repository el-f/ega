/* coverage: options.tasks.list-renders */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    taskOverrides: { summarize: { effort: 'high' } },
    disabledTasks: ['ask'],
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('the Tasks tab lists the built-ins with their state', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-tasks').click();
  await expect(page.locator('[data-ega-task-item]')).toHaveCount(7, { timeout: 5_000 });
  timeline.markStep('rows-rendered');

  await expect(page.locator('[data-ega-task-toggle="translate"]')).toBeDisabled();
  await expect(page.locator('[data-ega-task-item="translate"]')).toContainText('always on');
  await expect(page.locator('[data-ega-task-item="summarize"]')).toContainText('Edited');
  await expect(page.locator('[data-ega-task-item="ask"]')).toContainText('Off');
  await expect(page.locator('[data-ega-task-toggle="ask"]')).not.toBeChecked();
  await expect(page.locator('[data-ega-task-toggle="reword"]')).toBeChecked();
  const grammar = page.locator('[data-ega-task-item="grammar"]');
  await expect(grammar).not.toContainText('Edited');
  await expect(grammar).not.toContainText('Off');
  timeline.markStep('state-shown');

  // Explain has no prompt of its own; its dialog says which one it uses.
  await page.locator('[data-ega-task-edit="explain"]').click();
  await expect(page.locator('[data-ega-task-prompt-note]')).toContainText('Translate prompt');
  timeline.markStep('explain-note');
  timeline.report();
});
