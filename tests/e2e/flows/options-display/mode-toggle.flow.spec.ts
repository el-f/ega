/* coverage: options.display.mode-toggle */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { defaultDisplayMode: 'tooltip' });
});

test.afterEach(async () => {
  await ext.close();
});

test('toggle to inline mode hides tooltip-only knobs and persists defaultDisplayMode', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-translate').click();

  await expect(page.locator('[data-ega-setting="display.tooltipShowSource"]')).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.locator('[data-ega-knobs="tooltip"]')).toBeVisible();
  await expect(page.locator('[data-ega-knobs="inline"]')).toHaveCount(0);

  await page.locator('[data-ega-mode="inline"]').click();

  await expect(page.locator('[data-ega-knobs="inline"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-ega-knobs="tooltip"]')).toHaveCount(0);
  await expect(page.locator('[data-ega-setting="display.tooltipShowSource"]')).toHaveCount(0);

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.defaultDisplayMode;
      },
      { timeout: 5_000 },
    )
    .toBe('inline');

  await page.locator('[data-ega-mode="tooltip"]').click();
  await expect(page.locator('[data-ega-knobs="tooltip"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-ega-setting="display.tooltipShowSource"]')).toBeVisible();
});
