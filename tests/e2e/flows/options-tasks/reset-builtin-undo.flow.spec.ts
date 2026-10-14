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

test('Reset task drops the edit at once, and Undo in the footer puts it back', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-tasks').click();
  await page.locator('[data-ega-task-edit="reword"]').click();
  const dialog = page.locator('[data-ega-task-dialog="reword"]');
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: 'Reset task to built-in' }).click();
  await expect.poll(stored, { timeout: 5_000 }).toBeUndefined();
  await expect(page.locator('[data-ega-dialog-status]')).toContainText('Back to built-in');
  // The pill is gone, so focus moved to the Undo that took its place.
  await expect(page.locator('[data-ega-dialog-undo]')).toBeFocused();
  timeline.markStep('reset');

  await page.locator('[data-ega-dialog-undo]').click();
  await expect.poll(stored, { timeout: 5_000 }).toEqual({ effort: 'low', glossary: true });
  await expect(page.locator('[data-ega-dialog-status]')).toHaveText('Your edits are back');
  await page.locator('[data-ega-dialog-done]').click();
  await expect(page.locator('[data-ega-task-item="reword"]')).toContainText('Edited');
  timeline.markStep('undone');
  timeline.report();
});
