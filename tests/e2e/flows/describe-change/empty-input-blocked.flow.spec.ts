/* coverage: templating.describe-change.empty-input-blocked */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';
import { createTimeline, assertStaysStable } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Apply disabled when input is empty or whitespace-only', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="global"]').click();
  const header = page.locator('[data-ega-describe-header][data-ega-describe-scope="global"]');
  await expect(header).toBeVisible({ timeout: 10_000 });
  await header.locator('summary').click();

  const input = header.locator('[data-ega-describe-input]').first();
  await expect(input).toBeVisible({ timeout: 10_000 });
  timeline.markStep('input-visible');

  // Empty state: button must be disabled.
  const applyBtn = header.locator('[data-ega-describe-apply]').first();
  await expect(applyBtn).toBeDisabled({ timeout: 3_000 });
  timeline.markStep('empty-disabled');

  // Whitespace-only: button must remain disabled.
  await input.fill('   ');
  await assertStaysStable(() => applyBtn.isDisabled(), true, {
    windowMs: 800,
    message: 'Apply must stay disabled for whitespace-only input',
  });
  timeline.markStep('whitespace-disabled');

  // Non-empty input: button must become enabled.
  await input.fill('something real');
  await expect(applyBtn).toBeEnabled({ timeout: 3_000 });
  timeline.markStep('enabled-after-real-input');

  // Clear back to empty: button must disable again.
  await input.fill('');
  await expect(applyBtn).toBeDisabled({ timeout: 3_000 });
  timeline.markStep('disabled-after-clear');
});
