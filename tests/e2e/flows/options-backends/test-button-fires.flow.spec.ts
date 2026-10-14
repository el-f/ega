/* coverage: options.backends.test-button-fires */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, mockAnthropic, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-ant-seed',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Test now says how fast the backend answered, shows the answer, and the pill turns Verified', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Hello dear, how are you today?' });

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

  const testBtn = page.getByTestId('backend-card-test-anthropic');
  await expect(testBtn).toBeVisible({ timeout: 5_000 });
  await expect(testBtn).toBeEnabled({ timeout: 5_000 });
  await testBtn.click();
  timeline.markStep('clicked');

  await expect(card.locator('.be-latency')).toContainText('Answered in', { timeout: 15_000 });
  timeline.markStep('latency-visible');

  // Only the mocked text proves success.
  await expect(card.locator('[data-ega-test-answer]')).toContainText('Hello dear', {
    timeout: 5_000,
  });
  await expect(card.locator('[data-ega-backend-status]')).toHaveAttribute(
    'data-ega-backend-status',
    'Verified',
  );
  timeline.markStep('result-visible');

  // Verified is stored for this key, so it survives a reload.
  await page.reload();
  await page.locator('#tab-backends').click();
  await expect(
    page.locator('details[data-backend-id="anthropic"] [data-ega-backend-status]'),
  ).toHaveAttribute('data-ega-backend-status', 'Verified', { timeout: 5_000 });
  timeline.markStep('verified-after-reload');

  timeline.report();
});
