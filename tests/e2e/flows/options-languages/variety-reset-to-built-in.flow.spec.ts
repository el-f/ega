/* coverage: options.languages.variety-reset-to-built-in */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, readStorage, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

const VARIETY_ID = 'arabizi';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  // hasOverrides must be true or the "Reset to built-in" button never renders.
  await seedSettings(ext.context, ext.extensionId, {
    varietyOverrides: {
      [VARIETY_ID]: { hint: 'Overridden hint for reset test.', examples: [] },
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Reset to built-in removes the override and the Undo toast restores it', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-languages').click();
  timeline.markStep('tab-open');

  // Open the Arabizi row editor.
  const editBtn = page.locator(`button[aria-label="Edit"]`).first();
  await expect(editBtn).toBeVisible({ timeout: 5_000 });
  await editBtn.click();
  timeline.markStep('editor-open');

  // "Reset to built-in" button is shown only when v.hasOverrides.
  const resetBtn = page.locator('button.ega-btn', { hasText: 'Reset to built-in' });
  await expect(resetBtn).toBeVisible({ timeout: 5_000 });
  await resetBtn.click();
  timeline.markStep('reset');

  // varietyOverrides for arabizi must be gone from settings.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return Object.prototype.hasOwnProperty.call(s?.varietyOverrides ?? {}, VARIETY_ID);
      },
      { timeout: 5_000 },
    )
    .toBe(false);

  // The toast offers Undo; clicking it restores the saved override.
  const undoBtn = page.locator('[data-sonner-toast] button', { hasText: 'Undo' }).first();
  await expect(undoBtn).toBeVisible({ timeout: 10_000 });
  await undoBtn.click();
  timeline.markStep('undo-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.varietyOverrides[VARIETY_ID]?.hint ?? null;
      },
      { timeout: 5_000 },
    )
    .toBe('Overridden hint for reset test.');
});
