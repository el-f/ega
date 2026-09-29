/* coverage: templating.slot-palette.define-custom-variable */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const CUSTOM_TOKEN = '{{myVar}}';
const CUSTOM_NAME = 'myVar';
const CUSTOM_DESC = 'My custom variable used in tests';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('adding a custom token then defining it persists customSlotDescriptions', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await expect(page.locator('[data-ega-template-editor]').first()).toBeVisible({
    timeout: 10_000,
  });
  timeline.markStep('editor-mounted');

  // extractCustomSlots reads the user template and renders the chip plus Define button.
  const usrTextarea = page.locator('[data-ega-template-user] textarea').first();
  await usrTextarea.click();
  await usrTextarea.fill(`${CUSTOM_TOKEN} {{text}}`);
  timeline.markStep('custom-token-typed');

  const defineBtn = page
    .locator(`[data-ega-slot-palette] [data-ega-slot-define="${CUSTOM_NAME}"]`)
    .first();
  await expect(defineBtn).toBeVisible({ timeout: 5_000 });
  await defineBtn.click();
  timeline.markStep('define-clicked');

  const dialog = page.locator('.ega-dialog', { hasText: 'Define custom variable' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  const nameInput = dialog.locator('input[data-ega-slot-define-name]');
  await expect(nameInput).toHaveValue(CUSTOM_NAME, { timeout: 3_000 });

  const descInput = dialog.locator('input[data-ega-slot-define-desc]');
  await descInput.fill(CUSTOM_DESC);
  timeline.markStep('desc-filled');

  await dialog.getByRole('button', { name: 'Define', exact: true }).click();
  timeline.markStep('define-submitted');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.customSlotDescriptions[CUSTOM_NAME] ?? null;
      },
      { timeout: 10_000 },
    )
    .toBe(CUSTOM_DESC);
  timeline.markStep('persisted');

  await expect(defineBtn).not.toBeVisible({ timeout: 5_000 });
  timeline.markStep('define-affordance-cleared');
});
