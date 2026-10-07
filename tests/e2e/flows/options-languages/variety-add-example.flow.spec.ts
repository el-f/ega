/* coverage: options.languages.variety-add-example */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  openLanguageDialog,
  readStorage,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

const VARIETY_ID = 'arabizi';
const EXAMPLE_SRC = 'yalla habibi';
const EXAMPLE_TGT = 'Come on, darling.';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('Add example in the language dialog saves the pair to storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  const dialog = await openLanguageDialog(page, VARIETY_ID, 'Arabizi');
  timeline.markStep('editor-open');

  await dialog.locator('[data-ega-language-add-example]').click();
  timeline.markStep('example-row-added');

  // The new row is last, and focus is already in its first field.
  const rows = dialog.locator('[data-ega-language-example]');
  const last = rows.last();
  await expect(last.getByRole('textbox').first()).toBeFocused();
  await last.getByRole('textbox').first().fill(EXAMPLE_SRC);
  await last.getByRole('textbox').nth(1).fill(EXAMPLE_TGT);
  timeline.markStep('example-filled');

  await expect(page.locator('[data-ega-dialog-status]')).toHaveText('Saved', { timeout: 5_000 });
  timeline.markStep('saved');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const overrides = s?.varietyOverrides ?? {};
        const entry = overrides[VARIETY_ID] as
          { examples?: Array<{ src: string; tgt: string }> } | undefined;
        const examples = entry?.examples ?? [];
        return examples.some((e) => e.src === EXAMPLE_SRC && e.tgt === EXAMPLE_TGT);
      },
      { timeout: 5_000 },
    )
    .toBe(true);
});
