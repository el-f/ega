/* coverage: options.backends.model-select */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  // The model combobox is disabled until the provider has an API key.
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'sk-ant-seed' });
});

test.afterEach(async () => {
  await ext.close();
});

test('Anthropic model combobox persists settings.model.anthropic', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-backends').click();

  // A card with a key starts collapsed (autoOpen fires only for needs-config), so expand it first.
  const card = page.locator('details[data-backend-id="anthropic"]');
  await expect(card).toBeVisible({ timeout: 5_000 });
  await card.locator('summary').click();
  const modelInput = card.locator('input.ega-combobox-input');
  await expect(modelInput).toBeVisible({ timeout: 5_000 });
  await expect(modelInput).toBeEnabled({ timeout: 5_000 });
  await modelInput.fill('claude-sonnet-4');
  await modelInput.press('Tab');
  timeline.markStep('typed');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.model.anthropic;
      },
      { timeout: 5_000 },
    )
    .toBe('claude-sonnet-4');
});
