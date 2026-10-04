/* coverage: options.tasks.palette-renders */
import { test, expect } from '@playwright/test';
import { launchExtension, openTaskPrompt, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('slot palette renders the `text` chip on the Global template', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openTaskPrompt(page, 'translate');
  timeline.markStep('advanced-open');

  await expect(page.locator('[data-ega-slot-palette]').first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.locator('[data-ega-slot-palette] [data-ega-slot-chip="text"]').first(),
  ).toBeVisible({ timeout: 5_000 });
  timeline.markStep('text-chip-visible');
});
