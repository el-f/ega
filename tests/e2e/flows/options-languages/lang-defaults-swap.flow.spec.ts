/* coverage: options.languages.lang-defaults-swap */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    defaultLang: 'fr',
    defaultTargetLang: 'en',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('swap button swaps source/target language defaults and shows toast', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-languages').click();

  // Wait for LangDefaultsSection to render.
  await expect(page.locator('[data-ega-setting="defaults.defaultLang"]')).toBeVisible({
    timeout: 5_000,
  });
  timeline.markStep('lang-section-visible');

  // Confirm initial values: source = fr, target = en.
  const srcPicker = page.locator(
    '[data-ega-setting="defaults.defaultLang"] select[data-ega-lang-picker]',
  );
  const tgtPicker = page.locator(
    '[data-ega-setting="defaults.defaultTargetLang"] select[data-ega-lang-picker]',
  );
  await expect(srcPicker).toHaveValue('fr');
  await expect(tgtPicker).toHaveValue('en');

  await page.getByRole('button', { name: 'Swap languages' }).click();
  timeline.markStep('swap-clicked');

  // Storage: defaultLang becomes 'en', defaultTargetLang becomes 'fr'.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.defaultLang;
      },
      { timeout: 5_000 },
    )
    .toBe('en');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.defaultTargetLang;
      },
      { timeout: 5_000 },
    )
    .toBe('fr');
  timeline.markStep('storage-updated');

  // Toast "Languages swapped" appears (svelte-sonner renders into [data-sonner-toaster]).
  await expect(page.locator('[data-sonner-toaster]')).toContainText('Languages swapped', {
    timeout: 3_000,
  });
  timeline.markStep('toast-visible');
  timeline.report();
});
