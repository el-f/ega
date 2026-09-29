/* coverage: templating.recipes-gallery.apply-full-cancelled */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline, assertStaysStable } from '../_harness';

const TARGET_ID = 'explain-quick-tldr';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Apply dialog → Cancel → storage unchanged, dialog closes', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="recipes"]').click();
  await expect(page.locator('[data-ega-recipes-gallery]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('gallery-mounted');

  const before = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  const ruleCountBefore = (before?.advanced.rules ?? []).length;

  const card = page.locator(`[data-ega-recipe-id="${TARGET_ID}"]`);
  await expect(card).toBeVisible({ timeout: 5_000 });
  await card.locator('[data-ega-recipe-apply]').click();
  timeline.markStep('apply-opened');

  const dialog = page.locator('.ega-dialog').filter({ hasText: 'Apply' }).first();
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  timeline.markStep('dialog-open');

  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  timeline.markStep('cancel-clicked');

  await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  timeline.markStep('dialog-closed');

  // Hold the probe window open to catch a late write.
  await assertStaysStable(
    async () => {
      const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
      return (s?.advanced.rules ?? []).length;
    },
    ruleCountBefore,
    { windowMs: 1_500, message: 'rules grew after Cancel — apply should not have fired' },
  );
  timeline.markStep('storage-stable');
});
