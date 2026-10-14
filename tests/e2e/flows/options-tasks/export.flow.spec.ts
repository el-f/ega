/* coverage: options.tasks.export */
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  customTask,
  launchExtension,
  seedCustomTasks,
  seedSettings,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedCustomTasks(ext.context, ext.extensionId, [customTask()]);
  await seedSettings(ext.context, ext.extensionId, {
    taskOverrides: { grammar: { effort: 'low' } },
    disabledTasks: ['ask'],
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Export tasks downloads a tasks file with rows, edits and on/off', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-tasks').click();
  const downloadPromise = page.waitForEvent('download', { timeout: 5_000 });
  await page.locator('button', { hasText: 'Export tasks' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^ega-tasks-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const file = JSON.parse(await readFile(path, 'utf8')) as {
    egaTasks: {
      v: number;
      customTasks: { id: string }[];
      taskOverrides: unknown;
      disabledTasks: string[];
    };
  };
  expect(file.egaTasks.v).toBe(2);
  expect(file.egaTasks.customTasks.map((t) => t.id)).toEqual(['c-tweet']);
  expect(file.egaTasks.taskOverrides).toEqual({ grammar: { effort: 'low' } });
  expect(file.egaTasks.disabledTasks).toEqual(['ask']);
  await expect(page.locator('[role="status"]', { hasText: 'Exported 1 task' })).toBeVisible();
  timeline.markStep('downloaded');
  timeline.report();
});
