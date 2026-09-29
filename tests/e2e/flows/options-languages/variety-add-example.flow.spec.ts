/* coverage: options.languages.variety-add-example */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
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

test('Add another example in variety editor persists src+tgt pair to storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-languages').click();
  timeline.markStep('tab-open');

  // Open the Arabizi row editor.
  const editBtn = page.locator('button[aria-label="Edit"]').first();
  await expect(editBtn).toBeVisible({ timeout: 5_000 });
  await editBtn.click();
  timeline.markStep('editor-open');

  // Click "Add another example" to append a blank example row.
  const addExampleBtn = page.locator('button.ega-btn', { hasText: 'Add another example' });
  await expect(addExampleBtn).toBeVisible({ timeout: 5_000 });
  await addExampleBtn.click();
  timeline.markStep('example-row-added');

  // Fill the last src/tgt pair — the new row is always appended at the end.
  const srcInputs = page.locator('input[aria-label="Example source"]');
  const tgtInputs = page.locator('input[aria-label="Example translation"]');
  const lastSrc = srcInputs.last();
  const lastTgt = tgtInputs.last();
  await lastSrc.fill(EXAMPLE_SRC);
  await lastTgt.fill(EXAMPLE_TGT);
  timeline.markStep('example-filled');

  await page.locator('button.ega-btn.variant-primary', { hasText: 'Save' }).first().click();
  timeline.markStep('saved');

  await expect(page.locator('.ok', { hasText: 'Saved ✓' })).toBeVisible({ timeout: 3_000 });

  // varietyOverrides must include the new example pair.
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
