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

test('picking Inline persists defaultDisplayMode, and the tooltip options stay on screen', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-translate').click();

  await expect(page.locator('[data-ega-setting="display.tooltipShowSource"]')).toBeVisible({
    timeout: 5_000,
  });
  await page.locator('[data-ega-mode="inline"]').click();
  await expect(page.locator('[data-ega-mode="inline"]')).toHaveAttribute('aria-checked', 'true');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.defaultDisplayMode;
      },
      { timeout: 5_000 },
    )
    .toBe('inline');

  // The side panel and Explain still use the tooltip options, so they stay in Inline mode.
  await expect(page.locator('[data-ega-knobs="tooltip"]')).toBeVisible();
  await expect(page.locator('[data-ega-setting="display.tooltipShowSource"]')).toBeVisible();
  await expect(page.getByText('Inline mode has no settings of its own')).toHaveCount(0);
});
