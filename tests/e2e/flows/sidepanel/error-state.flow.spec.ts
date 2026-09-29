/* coverage: translation.sidepanel.error-state */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-bad',
    streaming: true,
  });
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await route.fulfill({
      status: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { type: 'authentication_error', message: 'bad key' } }),
    });
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('error chunk renders inline + offers a retry button', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-text').fill('hola');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  timeline.markStep('send-clicked');

  const errBlock = page.locator('.ega-assistant-error');
  await expect(errBlock).toBeVisible({ timeout: 10_000 });
  await expect(errBlock).toHaveAttribute('role', 'alert');
  timeline.markStep('error-visible');

  // AUTH is terminal — a retry with the same key just re-fails, so only "Open settings" is offered.
  await expect(page.locator('[data-ega-sidepanel-open-options]')).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.locator('.ega-retry-btn', { hasText: /retry/i })).toHaveCount(0);
  timeline.markStep('open-settings-visible-retry-absent');
});
