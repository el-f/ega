/* coverage: options.backends.api-key-edited-at-timestamp */
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

test('Pasting a new API key writes apiKeyEditedAt and shows "Edited just now"', async () => {
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
  await keyInput.fill('sk-ant-newkey99');
  await keyInput.press('Tab');
  timeline.markStep('key-entered');

  // "Edited just now" appears beneath the key field once apiKey is non-empty.
  const editedLine = card.locator('.cp-edited');
  await expect(editedLine).toContainText('just now', { timeout: 5_000 });
  timeline.markStep('edited-label-visible');

  // Storage must have apiKeyEditedAt.anthropic set to a recent timestamp.
  const before = Date.now();
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.apiKeyEditedAt['anthropic'] ?? null;
      },
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(before - 5_000);
  timeline.markStep('storage-updated');

  timeline.report();
});
