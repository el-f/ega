/* coverage: options.translate.generation-temperature-slider */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  // Start at default temperature (0.2) so ResetField is absent; the key puts a model that takes temperature at the head.
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-ant-test',
    advanced: { temperature: 0.2, maxTokens: 2048 },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('creativity slider persists; Changed and Reset section show; Reset puts it back with Undo', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-translate').click();

  const card = page.locator('[data-ega-generation-card]');
  await expect(card).toBeVisible({ timeout: 5_000 });
  timeline.markStep('generation-card-visible');

  // At defaults: no Changed marker, no Reset section, no slider is disabled for one backend.
  const reset = card.locator('[data-ega-section-reset]');
  await expect(reset).toHaveCount(0);
  await expect(card.locator('.ega-slider.disabled')).toHaveCount(0);

  const thumb = page.locator('[data-ega-setting="advanced.temperature"] [role="slider"]');
  await thumb.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  timeline.markStep('slider-advanced');

  const temperature = async (): Promise<number | undefined> =>
    (await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings'))?.advanced
      .temperature;
  await expect.poll(temperature, { timeout: 5_000 }).toBeGreaterThan(0.2);
  await expect(page.locator('[data-ega-setting="advanced.temperature"]')).toContainText('Changed');
  await expect(reset).toBeVisible();
  timeline.markStep('changed');

  await reset.click();
  await expect.poll(temperature, { timeout: 5_000 }).toBe(0.2);
  await expect(page.locator('[data-sonner-toaster]')).toContainText(
    'Generation is back to defaults',
  );
  // The pill is gone, so focus is on the card title, not the page.
  await expect(card.getByRole('heading', { name: 'Generation' })).toBeFocused();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(temperature, { timeout: 5_000 }).toBeGreaterThan(0.2);
  timeline.markStep('reset-and-undo');
  timeline.report();
});
