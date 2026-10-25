/* coverage: options.shell.label-swap-no-layout-shift */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, mockAnthropic, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import { expectNoLayoutShift } from '../_geometry';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'sk-ant-seed' });
});

test.afterEach(async () => {
  await ext.close();
});

test('Test now -> Testing... keeps every button of the test row in place', async () => {
  // Known defect on master: the button grows 78 -> 97 px. Branch fix/stable-button-width fixes it; drop this line then.
  test.fail(true, 'Test now resizes across its labels until fix/stable-button-width (R63) merges');
  const timeline = createTimeline();
  // The delay holds the running state long enough to measure it.
  mockAnthropic(ext.context, { translation: 'Hello', delayMs: 1_500 });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-backends').click();
  const card = page.locator('details[data-backend-id="anthropic"]');
  await expect(card).toBeVisible({ timeout: 5_000 });
  if (!(await card.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await card.locator('summary').click();
  }
  const testBtn = page.getByTestId('backend-card-test-anthropic');
  await expect(testBtn).toHaveText('Test now', { timeout: 5_000 });
  timeline.markStep('card-open');

  await expectNoLayoutShift(
    card,
    async () => {
      await testBtn.click();
      await expect(testBtn).toContainText('Testing...', { timeout: 5_000 });
    },
    'Test now -> Testing...',
  );
  timeline.markStep('running-measured');

  // The same element comes back to its idle label; the latency text flexes beside it.
  await expectNoLayoutShift(
    card,
    async () => {
      await expect(card.locator('.be-latency')).toContainText('Answered in', { timeout: 15_000 });
      await expect(testBtn).toHaveText('Test now');
    },
    'Testing... -> Test now',
  );
  timeline.markStep('result-visible');

  timeline.report();
});
