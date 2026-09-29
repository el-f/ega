/* coverage: templating.slot-palette.define-custom-variable-over-cap */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const CAP = 280;
const OVER_CAP_DESC = 'x'.repeat(400);
// Canonical shape: the settings parser drops a rule that misses `body`/`category`/`scope`/`source`/`addedAt`, which would look like the data loss this spec hunts for.
const SEEDED_RULE = {
  id: 'r-keep',
  body: 'Keep imperial units',
  category: 'always',
  scope: { tasks: [] },
  source: 'manual',
  addedAt: '2026-01-01T00:00:00.000Z',
  enabled: true,
};

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('an over-cap description is capped at 280 characters and the rest of advanced survives', async () => {
  const timeline = createTimeline();
  const before = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  await seedSettings(ext.context, ext.extensionId, {
    advanced: { ...before?.advanced, rules: [SEEDED_RULE] },
  });
  timeline.markStep('rule-seeded');

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await expect(page.locator('[data-ega-slot-palette]').first()).toBeVisible({ timeout: 10_000 });
  await page.locator('[data-ega-slot-insert-picker]').first().click();
  const addCustomBtn = page.locator('[data-ega-slot-add-custom]');
  await expect(addCustomBtn).toBeVisible({ timeout: 5_000 });
  await addCustomBtn.click();
  timeline.markStep('define-new-opened');

  const dialog = page.locator('.ega-dialog', { hasText: 'Define custom variable' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  await dialog.locator('input[data-ega-slot-define-name]').fill('longDesc');
  const descInput = dialog.locator('input[data-ega-slot-define-desc]');
  await descInput.fill(OVER_CAP_DESC);
  // The field carries `maxlength`, so typing and pasting both stop at the cap — submitDefine's length guard is a writer-side backstop the UI cannot reach (unit-tested there).
  expect((await descInput.inputValue()).length).toBe(CAP);
  timeline.markStep('over-cap-desc-entered');

  await dialog.getByRole('button', { name: 'Define', exact: true }).click();
  timeline.markStep('define-clicked');

  // Nothing left to refuse: the capped value is valid, so the define lands and the dialog closes.
  await expect(dialog).toBeHidden({ timeout: 5_000 });
  timeline.markStep('dialog-closed');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.customSlotDescriptions['longDesc'] ?? null;
      },
      { timeout: 10_000 },
    )
    .toBe('x'.repeat(CAP));

  const after = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  // An over-cap value must not take the whole advanced section down with it.
  expect(after?.advanced.rules).toEqual([SEEDED_RULE]);
  timeline.markStep('advanced-intact');
});
