/* coverage: translation.sidepanel.refine-inline-freeform */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  type ExtensionHandle,
  openRefineChips,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    contextEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('freeform [+ Refine] input submits custom refinement text and spawns a variant', async () => {
  const timeline = createTimeline();
  const route = mockAnthropic(ext.context, { translation: 'Hello friend.' });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-text').fill('hola amigo');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  await expect(page.locator('.ega-assistant-body').first()).toContainText('Hello', {
    timeout: 10_000,
  });
  timeline.markStep('first-turn-done');

  await openRefineChips(page);
  const refineToggle = page.locator('[data-ega-refine-chip="custom"]');
  await expect(refineToggle).toBeVisible({ timeout: 5_000 });

  await refineToggle.click();
  const refineInput = page.locator('[data-ega-refine-text]');
  await expect(refineInput).toBeVisible({ timeout: 3_000 });
  timeline.markStep('freeform-opened');

  await refineInput.fill('Use a more poetic style.');

  const applyBtn = page.locator('[data-ega-refine-apply]');
  await expect(applyBtn).toBeEnabled({ timeout: 3_000 });
  await applyBtn.click();
  timeline.markStep('apply-clicked');

  await expect(page.locator('[data-ega-variant-nav]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.ega-user-turn')).toHaveCount(1);
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(1);
  timeline.markStep('variant-spawned');

  await expect
    .poll(() => route.lastRequestBody(), { timeout: 5_000 })
    .toMatch(/Use a more poetic style\./);
  timeline.markStep('wire-payload-asserted');
});
