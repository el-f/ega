/* coverage: options.languages.variety-edit-save */
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
const HINT_SUFFIX = ' [e2e-edited]';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('Notes typed in the language dialog save themselves and the status says Saved', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  const dialog = await openLanguageDialog(page, VARIETY_ID, 'Arabizi');
  timeline.markStep('editor-open');

  const notes = dialog.getByLabel('Notes');
  await notes.focus();
  await page.keyboard.press('End');
  await page.keyboard.type(HINT_SUFFIX);
  timeline.markStep('typed');

  await expect(page.locator('[data-ega-dialog-status]')).toHaveText('Saved', { timeout: 5_000 });
  timeline.markStep('saved');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const overrides = s?.varietyOverrides ?? {};
        const hint = (overrides[VARIETY_ID] as { hint?: string } | undefined)?.hint;
        return hint ?? '';
      },
      { timeout: 5_000 },
    )
    .toContain(HINT_SUFFIX);
});
