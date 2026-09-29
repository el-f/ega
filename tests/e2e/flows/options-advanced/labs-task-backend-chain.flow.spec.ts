/* coverage: options.advanced.labs-task-backend-chain */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('Per-task backend chain add persists into advanced.taskBackendChains', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="labs"]').click();
  await expect(page.locator('#adv-pane-labs')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('labs-open');

  // The translate task row is [data-ega-backend-chain-row="translate"].
  const translateRow = page.locator('[data-ega-backend-chain-row="translate"]');
  await expect(translateRow).toBeVisible({ timeout: 5_000 });

  // Open the combobox dropdown via the toggle button and pick "anthropic".
  const toggleBtn = translateRow.locator('[aria-label="Show backend list"]');
  await toggleBtn.click();

  // Wait for a dropdown item to appear, then click "anthropic".
  const anthropicOption = page.locator('[data-ega-backend-chain-option="anthropic"]');
  await expect(anthropicOption).toBeVisible({ timeout: 5_000 });
  await anthropicOption.click();
  timeline.markStep('backend-added');

  // The chip should now appear inside the translate row.
  await expect(translateRow.locator('[data-ega-backend-chain-chip="anthropic"]')).toBeVisible({
    timeout: 5_000,
  });

  // Storage must reflect the new chain.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const chains = s?.advanced.taskBackendChains as Record<string, string[]> | undefined;
        return chains?.['translate'] ?? null;
      },
      { timeout: 8_000 },
    )
    .toEqual(['anthropic']);

  timeline.markStep('storage-updated');
  timeline.report();
});
