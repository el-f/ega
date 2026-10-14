/* coverage: options.languages.variety-toggle-enabled */
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

test('Enable checkbox uncheck persists id to disabledVarieties; re-check removes it', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-languages').click();
  timeline.markStep('tab-open');

  // The Arabizi variety is always present as a built-in. Its checkbox is labeled
  // "Enable Arabizi" per the template `ariaLabel="Enable {v.label}"`.
  const checkbox = page.locator('input[type="checkbox"][id^="enable-arabizi"]');
  await expect(checkbox).toBeVisible({ timeout: 5_000 });
  await expect(checkbox).toBeChecked();

  await checkbox.click();
  timeline.markStep('unchecked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.disabledVarieties ?? [];
      },
      { timeout: 5_000 },
    )
    .toContain('arabizi');

  await checkbox.click();
  timeline.markStep('re-checked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.disabledVarieties ?? ['arabizi'];
      },
      { timeout: 5_000 },
    )
    .not.toContain('arabizi');
});
