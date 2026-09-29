/* coverage: templating.slot-palette.required-missing-blocks-save */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('removing {{text}} shows required badge on chip AND blocks Save with alert', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await expect(page.locator('[data-ega-template-editor]').first()).toBeVisible({
    timeout: 10_000,
  });
  timeline.markStep('editor-mounted');

  const before = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  const originalUser = before?.advanced.promptTemplate.user ?? '';

  const usrTextarea = page.locator('[data-ega-template-user] textarea').first();
  await usrTextarea.click();
  await usrTextarea.fill('No required slot here, only {{targetLangLabel}}.');
  timeline.markStep('text-slot-removed');

  const textChip = page.locator('[data-ega-slot-palette] [data-ega-slot-chip="text"]').first();
  await expect(textChip).toBeVisible({ timeout: 5_000 });
  await expect(textChip).toContainText(/required/i, { timeout: 5_000 });
  timeline.markStep('required-badge-visible');

  const saveBtn = page.locator('[data-ega-template-save]').first();
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
  await saveBtn.click();
  timeline.markStep('save-clicked');

  // Match by text — a bare [role="alert"].first() picks up the hidden live region.
  await expect(page.locator('[role="alert"]', { hasText: /must include/i })).toBeVisible({
    timeout: 5_000,
  });
  timeline.markStep('alert-shown');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.promptTemplate.user ?? '';
      },
      { timeout: 5_000 },
    )
    .toBe(originalUser);
  timeline.markStep('storage-unchanged');
});
