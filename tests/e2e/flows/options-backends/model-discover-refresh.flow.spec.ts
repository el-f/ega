/* coverage: options.backends.model-discover-refresh */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

const DISCOVERED_MODELS = ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5-20251001'];

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-ant-seed',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Refresh model list populates discovered models; picking one persists to storage', async () => {
  const timeline = createTimeline();

  // Discovery pages the list (limit, after_id), so match with a wildcard or the call reaches the network.
  await ext.context.route('https://api.anthropic.com/v1/models*', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify({
        data: DISCOVERED_MODELS.map((id) => ({ id, display_name: id, type: 'model' })),
        has_more: false,
      }),
    });
  });

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

  const modelInput = card.locator('input.ega-combobox-input');
  await expect(modelInput).toBeVisible({ timeout: 5_000 });
  await expect(modelInput).toBeEnabled({ timeout: 5_000 });
  timeline.markStep('card-expanded');

  // Click the Refresh button (aria-label contains "Refresh").
  const refreshBtn = card.getByRole('button', { name: /Refresh model list from the backend/i });
  await expect(refreshBtn).toBeVisible({ timeout: 3_000 });
  await refreshBtn.click();
  timeline.markStep('refresh-clicked');

  // Two .cp-section-meta elements exist (auth and model); take the one that says "discovered".
  await expect(
    card.locator('.cp-section-meta small').filter({ hasText: 'discovered' }),
  ).toBeVisible({ timeout: 10_000 });
  timeline.markStep('discovery-done');

  // Open the combobox dropdown and pick a model.
  const targetModel = DISCOVERED_MODELS[0] ?? DISCOVERED_MODELS[1] ?? 'claude-opus-4-5';
  await modelInput.fill(targetModel);
  await modelInput.press('Tab');
  timeline.markStep('model-typed');

  // Storage persists the picked model.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.model.anthropic;
      },
      { timeout: 5_000 },
    )
    .toBe(targetModel);
  timeline.markStep('storage-persisted');

  timeline.report();
});
