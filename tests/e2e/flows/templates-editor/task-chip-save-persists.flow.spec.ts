/* coverage: templating.templates-editor.task-chip-save-persists */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const MARKER = '/* TASK-CHIP-SAVE-PERSISTS-REWORD */ ';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('editing reword user template then Save persists taskTemplates.reword to storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await expect(page.locator('[data-ega-workbench-chip="global"]')).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 5_000 },
  );

  await page.locator('[data-ega-workbench-chip="reword"]').click();
  timeline.markStep('reword-chip-clicked');

  await expect(
    page.locator('[data-ega-task-tab-wrapper="reword"] [data-ega-template-editor]'),
  ).toBeVisible({ timeout: 10_000 });
  timeline.markStep('task-editor-mounted');

  const usrTextarea = page
    .locator('[data-ega-task-tab-wrapper="reword"] [data-ega-template-user] textarea')
    .first();
  await usrTextarea.click();
  await page.keyboard.press('Home');
  await page.keyboard.type(MARKER);
  timeline.markStep('typed-marker');

  const saveBtn = page
    .locator('[data-ega-task-tab-wrapper="reword"] [data-ega-template-save]')
    .first();
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
  await saveBtn.click();
  timeline.markStep('save-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const tpl = s?.advanced.taskTemplates['reword'];
        return tpl?.user ?? '';
      },
      { timeout: 10_000 },
    )
    .toContain(MARKER);
  timeline.markStep('persisted');

  await expect(saveBtn).toBeDisabled({ timeout: 5_000 });
});
