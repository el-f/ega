/* coverage: options.tasks.switches-persist */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('the task dialog writes effort, page context and glossary, and shows them after a reload', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  const url = `chrome-extension://${ext.extensionId}/src/options/index.html`;
  await page.goto(url);
  await page.locator('#tab-tasks').click();
  await page.locator('[data-ega-task-edit="summarize"]').click();
  const dialog = page.locator('[data-ega-task-dialog="summarize"]');
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  // One write at a time: a saved result re-renders the dialog, so a click must not land on a stale box.
  const summarize = async (): Promise<unknown> =>
    (await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings'))?.taskOverrides
      .summarize;
  await dialog.locator('[data-ega-task-effort] select').selectOption('high');
  await expect.poll(summarize, { timeout: 5_000 }).toEqual({ effort: 'high' });
  const pageContext = dialog.locator('[data-ega-task-page-context]');
  await pageContext.click();
  await expect(pageContext).toBeChecked();
  await expect.poll(summarize, { timeout: 5_000 }).toEqual({ effort: 'high', pageContext: true });
  const glossary = dialog.locator('[data-ega-task-glossary]');
  await glossary.click();
  await expect(glossary).toBeChecked();
  await expect
    .poll(
      async () =>
        (await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings'))?.taskOverrides
          .summarize,
      { timeout: 5_000 },
    )
    .toEqual({ effort: 'high', pageContext: true, glossary: true });
  timeline.markStep('saved');

  await page.reload();
  await page.locator('#tab-tasks').click();
  await expect(page.locator('[data-ega-task-item="summarize"]')).toContainText('Edited');
  await page.locator('[data-ega-task-edit="summarize"]').click();
  const again = page.locator('[data-ega-task-dialog="summarize"]');
  await expect(again.locator('[data-ega-task-effort] select')).toHaveValue('high');
  await expect(again.locator('[data-ega-task-page-context]')).toBeChecked();
  await expect(again.locator('[data-ega-task-glossary]')).toBeChecked();
  timeline.markStep('reloaded');

  // The prompt is edited right here, in the same dialog.
  await expect(again.locator('[data-ega-template-editor]')).toBeVisible();
  timeline.markStep('prompt-in-dialog');
  timeline.report();
});
