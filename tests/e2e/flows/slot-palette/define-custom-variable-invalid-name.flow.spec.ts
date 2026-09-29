/* coverage: templating.slot-palette.define-custom-variable-invalid-name */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

// The hyphen fails the /^\w+$/ name check.
const INVALID_NAME = 'my-var';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('invalid name in Define dialog shows error and does not write storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await expect(page.locator('[data-ega-slot-palette]').first()).toBeVisible({
    timeout: 10_000,
  });
  timeline.markStep('palette-mounted');

  await page.locator('[data-ega-slot-insert-picker]').first().click();
  const addCustomBtn = page.locator('[data-ega-slot-add-custom]');
  await expect(addCustomBtn).toBeVisible({ timeout: 5_000 });
  await addCustomBtn.click();
  timeline.markStep('define-new-opened');

  const dialog = page.locator('.ega-dialog', { hasText: 'Define custom variable' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  const before = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  const beforeDesc = before?.advanced.customSlotDescriptions ?? {};

  const nameInput = dialog.locator('input[data-ega-slot-define-name]');
  await nameInput.fill(INVALID_NAME);
  timeline.markStep('invalid-name-entered');

  await dialog.getByRole('button', { name: 'Define', exact: true }).click();
  timeline.markStep('define-clicked');

  const errAlert = dialog.locator('[role="alert"]');
  await expect(errAlert).toBeVisible({ timeout: 5_000 });
  await expect(errAlert).toContainText('Use only letters, digits and underscores.');
  timeline.markStep('error-shown');

  await expect(dialog).toBeVisible();

  const after = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  expect(after?.advanced.customSlotDescriptions ?? {}).toEqual(beforeDesc);
  timeline.markStep('storage-unchanged');
});
