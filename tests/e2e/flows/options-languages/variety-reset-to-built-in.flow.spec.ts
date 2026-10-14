/* coverage: options.languages.variety-reset-to-built-in */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  openLanguageDialog,
  seedSettings,
  readStorage,
  type ExtensionHandle,
} from '../../helpers';
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

test('Reset language removes the override, and Undo in the dialog restores it', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  const dialog = await openLanguageDialog(page, VARIETY_ID, 'Arabizi');
  timeline.markStep('editor-open');

  // Shown only while the language differs from the built-in.
  await page.getByRole('button', { name: 'Reset language' }).click();
  timeline.markStep('reset');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return Object.prototype.hasOwnProperty.call(s?.varietyOverrides ?? {}, VARIETY_ID);
      },
      { timeout: 5_000 },
    )
    .toBe(false);
  await expect(page.locator('[data-ega-dialog-status]')).toContainText('Back to built-in');

  // Undo sits in the dialog footer and takes focus, where the reset pill was.
  const undo = page.locator('[data-ega-dialog-undo]');
  await expect(undo).toBeFocused();
  await undo.click();
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
  await expect(dialog.getByLabel('Notes')).toHaveValue('Overridden hint for reset test.');
});
