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

test('Test now button fires, renders latency badge and result text', async () => {
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

  // Latency badge renders once the test call resolves.
  const latencyBadge = card.locator('.be-latency').first();
  await expect(latencyBadge).toBeVisible({ timeout: 15_000 });
  timeline.markStep('latency-visible');

  // The error path renders latency and a result too, so only the mocked text proves success.
  const resultText = card.locator('.be-testresult');
  await expect(resultText).toContainText('Hello dear', { timeout: 5_000 });
  timeline.markStep('result-visible');

  timeline.report();
});
