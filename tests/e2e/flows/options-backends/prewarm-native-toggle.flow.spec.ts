/* coverage: options.backends.prewarm-native-toggle */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  // Default preWarmNative is true; the toggle row is rendered alongside the
  // local-backend probe timeout slider, both gated on the parent Backends tab.
  await seedSettings(ext.context, ext.extensionId, {
    preWarmNative: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('toggle off persists preWarmNative=false; toggle back on persists true', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-backends').click();

  const toggle = page.getByTestId('prewarm-native-toggle').locator('input[type="checkbox"]');
  await expect(toggle).toBeVisible({ timeout: 5_000 });
  await expect(toggle).toBeChecked();

  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.preWarmNative;
      },
      { timeout: 3_000 },
    )
    .toBe(false);

  await toggle.check();
  await expect(toggle).toBeChecked();
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.preWarmNative;
      },
      { timeout: 3_000 },
    )
    .toBe(true);
});
