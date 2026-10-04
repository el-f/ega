import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from './helpers';
import { DEFAULT_SETTINGS } from '../../src/shared/settings-defaults';
import { CLOUD_PROVIDER_IDS } from '../../src/shared/provider-ids';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('Backends tab: every registered cloud + local backend renders a card', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    disabledBackends: [...DEFAULT_SETTINGS.disabledBackends],
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.getByRole('tab', { name: /^Backends$/ }).click();

  // Each card owns its own `data-section` wrapper; there is no grouping parent.
  await expect(page.locator('[data-section="cloud"]')).toHaveCount(CLOUD_PROVIDER_IDS.length);
  await expect(page.locator('[data-section="local"]')).toHaveCount(2);
  await expect(page.locator('[data-section="native"]')).toHaveCount(1);

  for (const id of CLOUD_PROVIDER_IDS) {
    await expect(page.locator(`[data-section="cloud"] [data-backend-id="${id}"]`)).toBeVisible();
  }
  await expect(page.locator('[data-section="local"] [data-backend-id="ollama"]')).toBeVisible();
  await expect(
    page.locator('[data-section="local"] [data-backend-id="localserver"]'),
  ).toBeVisible();
});

test('Backends tab: every card starts collapsed, including one that needs setup', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: '',
    disabledBackends: [...DEFAULT_SETTINGS.disabledBackends],
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.getByRole('tab', { name: /^Backends$/ }).click();

  const anthropicCard = page.locator('[data-backend-id="anthropic"]');
  const openaiCard = page.locator('[data-backend-id="openai"]');
  await expect(anthropicCard).toBeVisible();
  await expect(openaiCard).toBeVisible();

  // Anthropic ships enabled with a blank key (needs setup) and still starts collapsed.
  await expect(anthropicCard.locator('.be-status-needs-config')).toBeVisible({ timeout: 5_000 });
  await expect(anthropicCard).not.toHaveAttribute('open', '');
  await expect(openaiCard).not.toHaveAttribute('open', '');
});
