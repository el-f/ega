/* coverage: options.languages.variety-edit-save */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
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

test('Edit variety hint then Save persists to varietyOverrides and shows Saved ✓', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-languages').click();
  timeline.markStep('tab-open');

  // Open the Arabizi row editor via its Edit icon button.
  const editBtn = page.locator(`button[aria-label="Edit"]`).first();
  await expect(editBtn).toBeVisible({ timeout: 5_000 });
  await editBtn.click();
  timeline.markStep('editor-open');

  const hintArea = page.locator(`#hint-${VARIETY_ID}`);
  await expect(hintArea).toBeVisible({ timeout: 5_000 });
  await hintArea.focus();
  await page.keyboard.press('End');
  await page.keyboard.type(HINT_SUFFIX);
  timeline.markStep('typed');

  await page.locator('button.ega-btn.variant-primary', { hasText: 'Save' }).first().click();
  timeline.markStep('saved');

  // "Saved ✓" flash must appear.
  await expect(page.locator('.ok', { hasText: 'Saved ✓' })).toBeVisible({ timeout: 3_000 });

  // varietyOverrides in settings must contain the edited hint.
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
