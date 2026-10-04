/* coverage: options.backends.api-key-show-hide */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-ant-seed99',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Eye toggle reveals and re-masks the API key field', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-backends').click();
  timeline.markStep('tab-active');

  const card = page.locator('details[data-backend-id="anthropic"]');
  await expect(card).toBeVisible({ timeout: 5_000 });
  const isOpen = await card.evaluate((el) => (el as HTMLDetailsElement).open);
  if (!isOpen) {
    await card.locator('summary').click();
  }

  const keyInput = card.locator('input.cp-key-input');
  await expect(keyInput).toBeVisible({ timeout: 5_000 });

  // Initially masked.
  await expect(keyInput).toHaveAttribute('type', 'password');
  timeline.markStep('initially-masked');

  // Click Eye — reveal.
  const showBtn = card.getByRole('button', { name: 'Show API key' });
  await expect(showBtn).toBeVisible({ timeout: 3_000 });
  await showBtn.click();
  await expect(keyInput).toHaveAttribute('type', 'text', { timeout: 3_000 });
  timeline.markStep('revealed');

  // Click EyeOff — mask again.
  const hideBtn = card.getByRole('button', { name: 'Hide API key' });
  await expect(hideBtn).toBeVisible({ timeout: 3_000 });
  await hideBtn.click();
  await expect(keyInput).toHaveAttribute('type', 'password', { timeout: 3_000 });
  timeline.markStep('masked-again');

  timeline.report();
});
