/* coverage: options.context-menu.image-opens-in */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('an image action sets where it opens; the Display card no longer does', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  // The "Where answers show" card has no image select: one control per value.
  await expect(page.locator('[data-ega-setting="display.defaultDisplayMode"]')).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByText('Image translation opens in')).toHaveCount(0);

  await page.locator('#tab-selection-bubble').click();
  const row = page.locator('[data-ega-cm-id="ega-translate-image"]');
  const edit = row.getByRole('button', { name: 'Edit Translate image in side panel' });
  await edit.click();
  await expect(edit).toHaveAttribute('aria-expanded', 'true');
  const onPage = row.getByRole('radio', { name: 'On the page' });
  await onPage.click();
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const item = s?.contextMenuItems.find((i) => i.id === 'ega-translate-image');
        return item && 'surface' in item ? item.surface : null;
      },
      { timeout: 5_000 },
    )
    .toBe('tooltip');
  timeline.markStep('saved');
  await expect(row.locator('[data-ega-cm-name]')).toHaveText('Translate image');
  // The row stays mounted, so the radio keeps focus.
  await expect(onPage).toBeFocused();
  await expect(row.getByText('On the page shows a tooltip on the image')).toBeVisible();
  timeline.report();
});
