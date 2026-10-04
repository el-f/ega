/* coverage: options.backends.api-key-edit */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('Anthropic API-key input persists anthropicApiKey to storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-backends').click();
  timeline.markStep('backends-active');

  // CloudProviderCard renders an Input with placeholder = card.keyPlaceholder.
  // Anthropic placeholder is "sk-ant-…".
  const keyInput = page.locator('input[placeholder^="sk-ant-"]').first();
  await expect(keyInput).toBeVisible({ timeout: 5_000 });
  await keyInput.fill('sk-ant-test12345');
  // Blur via Tab so any oninput->point() pipeline that defers to blur fires.
  await keyInput.press('Tab');
  timeline.markStep('typed');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.anthropicApiKey;
      },
      { timeout: 5_000 },
    )
    .toBe('sk-ant-test12345');
});
