/* coverage: templating.slot-palette.insert-variable-popover */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Insert variable popover opens + fuzzy-finds a built-in slot', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await expect(page.locator('[data-ega-slot-palette]').first()).toBeVisible({
    timeout: 10_000,
  });
  timeline.markStep('palette-mounted');

  await page.locator('[data-ega-slot-insert-picker]').first().click();
  timeline.markStep('popover-open');

  // The trigger hosts the input, so typing right after the click drives the fuzzy filter.
  const listbox = page.getByRole('listbox').first();
  await expect(listbox).toBeVisible({ timeout: 5_000 });
  await page.keyboard.type('tex');
  await expect(listbox.getByRole('option', { name: /text/i }).first()).toBeVisible({
    timeout: 5_000,
  });
  timeline.markStep('text-option-matched');

  const popover = page.locator('.ega-command-popover').first();
  const pillRow = page.locator('[data-ega-slot-row="builtin"]').first();
  await expect(popover).toBeVisible();
  const popBox = await popover.boundingBox();
  const rowBox = await pillRow.boundingBox();
  expect(popBox).not.toBeNull();
  expect(rowBox).not.toBeNull();
  if (popBox && rowBox) {
    const overlaps =
      popBox.x < rowBox.x + rowBox.width &&
      popBox.x + popBox.width > rowBox.x &&
      popBox.y < rowBox.y + rowBox.height &&
      popBox.y + popBox.height > rowBox.y;
    expect(overlaps, 'Insert-variable popover overlaps slot pill row').toBe(false);
  }
  timeline.markStep('popover-clear-of-pills');
});
