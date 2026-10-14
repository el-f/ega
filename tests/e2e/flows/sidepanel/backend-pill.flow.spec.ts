/* coverage: translation.sidepanel.backend-pill */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('sidepanel header chip renders the active backend name', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  timeline.markStep('sidepanel-opened');

  const chip = page.locator('.active-backend-chip');
  await expect(chip).toBeVisible({ timeout: 5_000 });
  timeline.markStep('chip-visible');

  // The chip waits on settings before it paints, so poll for the resolved manifest name.
  await expect(chip.locator('.chip-name')).toHaveText('Anthropic', { timeout: 5_000 });
  timeline.markStep('label-resolved');

  // The chip opens the backends in the order Ega tries them, each with a plain status.
  await chip.click();
  const row = page.locator('[data-ega-backend-row="anthropic"]');
  await expect(row).toContainText('In use');
  await expect(page.getByText('Ega tries them in this order.')).toBeVisible();
  timeline.markStep('popover-open');
});
