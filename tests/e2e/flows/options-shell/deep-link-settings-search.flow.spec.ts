/* coverage: options.shell.deep-link-settings-search */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('Settings search result deep-links into Advanced tab at correct sub-tab with flash', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');

  // Open settings search via Ctrl+, (Meta+, on macOS).
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,');
  const input = page.locator('input[placeholder^="Search settings"]');
  await expect(input).toBeVisible({ timeout: 5_000 });
  timeline.markStep('search-open');

  // "Record request details" lives on Advanced > Diagnostics, not the Data sub-tab Advanced opens on.
  await input.fill('record request details');
  // The suggestions share the list id, so wait on the results listbox before Enter.
  await expect(page.getByRole('listbox', { name: 'Settings results' })).toBeVisible({
    timeout: 5_000,
  });
  timeline.markStep('results-shown');

  // Activate the first result (Enter navigates to it).
  await page.keyboard.press('Enter');
  await expect(input).not.toBeVisible({ timeout: 5_000 });
  timeline.markStep('dialog-closed');

  // Advanced tab must now be active.
  await expect(page.locator('#tab-advanced')).toHaveAttribute('aria-selected', 'true', {
    timeout: 5_000,
  });

  // The Diagnostics sub-tab must be the active pane.
  await expect(page.locator('#adv-pane-diagnostics')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('advanced-diagnostics-visible');

  // The target card (captureResultMeta) must eventually carry data-flash="true"
  // and then have it removed (~800 ms). Assert it appears at some point.
  const targetCard = page.locator('[data-ega-setting="advanced.captureResultMeta"]');
  await expect(targetCard).toBeVisible({ timeout: 5_000 });
  await expect
    .poll(
      async () => {
        const attr = await targetCard.getAttribute('data-flash');
        return attr === 'true';
      },
      { timeout: 3_000 },
    )
    .toBe(true);
  timeline.markStep('flash-observed');
  timeline.report();
});

test('Settings search for an API key opens the closed backend card and focuses the key field', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,');
  const input = page.locator('input[placeholder^="Search settings"]');
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.fill('Mistral API key');
  await expect(page.getByRole('listbox', { name: 'Settings results' })).toBeVisible({
    timeout: 5_000,
  });
  await page.keyboard.press('Enter');
  await expect(input).not.toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#tab-backends')).toHaveAttribute('aria-selected', 'true', {
    timeout: 5_000,
  });

  // Backend cards start closed; the jump opens the one that holds the field.
  const key = page.locator('[data-ega-api-key="mistral"]');
  await expect(page.locator('details[data-backend-id="mistral"]')).toHaveAttribute('open', '', {
    timeout: 5_000,
  });
  await expect(key).toBeVisible();
  await expect(key).toBeFocused();
});
