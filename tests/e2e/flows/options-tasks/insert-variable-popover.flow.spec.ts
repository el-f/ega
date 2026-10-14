/* coverage: options.tasks.insert-variable-popover */
import { test, expect } from '@playwright/test';
import { launchExtension, openTaskPrompt, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Insert variable opens a searchable list that filters by name, token or meaning', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openTaskPrompt(page, 'summarize');

  await page.locator('[data-ega-slot-insert-picker]').click();
  timeline.markStep('popover-open');

  const search = page.locator('[data-ega-variable-picker] input');
  await expect(search).toBeFocused({ timeout: 5_000 });
  await page.keyboard.type('notes');
  const picker = page.locator('[data-ega-variable-picker]');
  await expect(picker.locator('[data-ega-variable="langHint"]')).toBeVisible();
  await expect(picker.locator('[data-ega-variable="text"]')).toBeHidden();
  timeline.markStep('filtered');

  // A variable this prompt cannot fill is listed with its reason and does not insert.
  await search.fill('explain');
  const empty = picker.locator('[data-ega-variable="explainInstr"]');
  await expect(empty).toHaveAttribute('aria-disabled', 'true');
  await expect(empty).toContainText('Filled only for Explain');

  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await expect(page.locator('[data-ega-slot-insert-picker]')).toBeFocused();
  // Esc closed the list only, not the dialog.
  await expect(page.locator('[data-ega-task-dialog="summarize"]')).toBeVisible();
  timeline.markStep('closed');
});
