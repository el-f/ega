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

  // Translate keeps its Tab stop; "Always on" is the reason it cannot be turned off.
  // Playwright reads aria-disabled as disabled, so the Tab stop is checked by focusing it.
  const translate = page.locator('[data-ega-task-toggle="translate"]');
  await expect(translate).not.toHaveAttribute('disabled');
  await expect(translate).toHaveAttribute('aria-disabled', 'true');
  await translate.focus();
  await expect(translate).toBeFocused();
  await page.keyboard.press('Space');
  await expect(translate).toBeChecked();
  await expect(translate).toHaveAccessibleDescription(/Always on/);
  await expect(page.locator('[data-ega-task-item="summarize"]')).toContainText('Edited');
  await expect(page.locator('[data-ega-task-toggle="ask"]')).not.toBeChecked();
  await expect(page.locator('[data-ega-task-toggle="reword"]')).toBeChecked();
  await expect(page.locator('[data-ega-task-item="grammar"]')).not.toContainText('Edited');
  // With no task of your own, the empty state holds the only New task.
  await expect(page.locator('[data-ega-custom-task-new]')).toHaveCount(0);
  timeline.markStep('state-shown');

  // Explain has no prompt of its own; its dialog says which one it uses.
  await page.locator('[data-ega-task-edit="explain"]').click();
  await expect(page.locator('[data-ega-task-prompt-note]')).toContainText('Translate prompt');
  timeline.markStep('explain-note');
  timeline.report();
});
