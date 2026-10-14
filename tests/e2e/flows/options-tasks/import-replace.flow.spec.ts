/* coverage: options.tasks.import-replace */
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
  await seedCustomTasks(ext.context, ext.extensionId, [customTask({ id: 'c-old', label: 'Old' })]);
});

test.afterEach(async () => {
  await ext.close();
});

test('Import tasks merges rows and edits, preserves unrelated tasks, and offers Undo', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-tasks').click();
  await expect(page.locator('[data-ega-custom-task-list]')).toContainText('Old');

  const file = JSON.stringify({
    egaTasks: {
      v: 1,
      exportedAt: new Date().toISOString(),
      customTasks: [customTask({ id: 'c-new', label: 'Haiku' }), { id: 'broken' }],
      taskOverrides: { grammar: { effort: 'low' } },
      disabledTasks: ['ask'],
    },
  });
  const chooser = page.waitForEvent('filechooser', { timeout: 5_000 });
  await page.locator('label', { hasText: 'Import tasks' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'ega-tasks.json',
    mimeType: 'application/json',
    buffer: Buffer.from(file),
  });
  const dialog = page.locator('.ega-dialog', { hasText: 'Add and update tasks?' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  timeline.markStep('confirmed');

  await expect(
    page.locator('[role="status"]', { hasText: 'Added 1 task and updated 0 tasks. Skipped 1.' }),
  ).toBeVisible({ timeout: 8_000 });
  await expect
    .poll(
      async () =>
        (
          (await readStorage<{ id: string }[]>(ext.context, ext.extensionId, 'ega.customTasks')) ??
          []
        ).map((t) => t.id),
      { timeout: 5_000 },
    )
    .toEqual(['c-old', 'c-new']);
  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  expect(s?.taskOverrides).toEqual({ grammar: { effort: 'low' } });
  expect(s?.disabledTasks).toEqual(['ask']);
  await expect(page.locator('[data-ega-custom-task-list]')).toContainText('Haiku');
  await expect(page.locator('[data-ega-custom-task-list]')).toContainText('Old');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    page.locator('[role="status"]', { hasText: 'Undid the task import.' }),
  ).toBeVisible();
  await expect(page.locator('[data-ega-custom-task-list]')).not.toContainText('Haiku');
  await expect(page.locator('[data-ega-custom-task-list]')).toContainText('Old');
  timeline.markStep('merged');
  timeline.report();
});
