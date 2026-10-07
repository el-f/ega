/* coverage: options.backends.reset-all-advanced-to-defaults */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, readStorage, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    sitePrefs: { 'reset-flow.example.com': { disabled: true } },
    advanced: { temperature: 0.9, maxTokens: 500 },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Reset puts the prompt and model settings back at once, keeps site overrides, and Undo restores them', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="data"]').click();
  timeline.markStep('data-tab-open');

  await page.locator('[data-ega-reset-defaults]').click();
  timeline.markStep('reset');
  // Acts at once: no typed confirm.
  await expect(page.locator('.ega-dialog')).toHaveCount(0);

  const stored = async (): Promise<Settings | null> =>
    readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  await expect
    .poll(async () => (await stored())?.advanced.temperature, { timeout: 10_000 })
    .not.toBe(0.9);
  expect((await stored())?.advanced.maxTokens).not.toBe(500);
  // Site overrides have their own card; Reset leaves them.
  expect(Object.keys((await stored())?.sitePrefs ?? {}).length).toBeGreaterThan(0);

  const toast = page.locator('[data-sonner-toast]', {
    hasText: 'Prompt and model settings are back to defaults',
  });
  await toast.getByRole('button', { name: 'Undo' }).click();
  timeline.markStep('undone');
  await expect
    .poll(async () => (await stored())?.advanced.temperature, { timeout: 10_000 })
    .toBe(0.9);
  expect((await stored())?.advanced.maxTokens).toBe(500);
});
