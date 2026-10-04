/* coverage: options.tasks.reset-builtin-undo */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    taskOverrides: { reword: { effort: 'low', glossary: true } },
  });
});

test.afterEach(async () => {
  await ext.close();
});

const stored = async (): Promise<unknown> =>
  (await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings'))?.taskOverrides.reword;

test('Reset to built-in drops the edit, and Undo puts it back', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-tasks').click();
  await page.locator('[data-ega-task-edit="reword"]').click();
  await page.locator('[data-ega-task-reset]').click();
  await expect.poll(stored, { timeout: 5_000 }).toBeUndefined();
  // The dialog closes, so the Undo toast is on the page and in reach.
  await expect(page.locator('[data-ega-task-dialog]')).toHaveCount(0);
  await expect(page.locator('[data-ega-task-item="reword"]')).not.toContainText('Edited');
  timeline.markStep('reset');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(stored, { timeout: 5_000 }).toEqual({ effort: 'low', glossary: true });
  await expect(page.locator('[data-ega-task-item="reword"]')).toContainText('Edited');
  timeline.markStep('undone');
  timeline.report();
});
