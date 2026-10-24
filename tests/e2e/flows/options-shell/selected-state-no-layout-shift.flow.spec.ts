/* coverage: options.shell.selected-state-no-layout-shift */
import { test, expect, type Locator } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import { expectNoLayoutShift } from '../_geometry';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

const background = (l: Locator): Promise<string> =>
  l.evaluate((el) => getComputedStyle(el).backgroundColor);

test('picking an Effort segment and switching tabs moves no button, and the pick shows and sticks', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  const block = page.locator('[data-ega-setting="advanced.effort"]');
  await expect(block).toBeVisible({ timeout: 5_000 });
  timeline.markStep('translate-tab');

  for (const value of ['high', 'low'] as const) {
    const item = block.locator(`[data-ega-effort-value="${value}"]`);
    await expectNoLayoutShift(
      block,
      async () => {
        await item.click();
        await expect(item).toHaveAttribute('aria-checked', 'true');
      },
      `Effort -> ${value}`,
    );
    // Selected shows by fill, not by weight: it must still look different from an unselected item.
    const other = block.locator('[data-ega-effort-value="medium"]');
    expect(await background(item)).not.toBe(await background(other));
    await expect
      .poll(
        async () =>
          (
            await readStorage<{ advanced?: { effort?: string } }>(
              ext.context,
              ext.extensionId,
              'ega.settings',
            )
          )?.advanced?.effort,
        { timeout: 5_000 },
      )
      .toBe(value);
  }
  timeline.markStep('effort-picked');

  const nav = page.locator('nav.options-nav');
  const tab = page.locator('#tab-backends');
  await expectNoLayoutShift(
    nav,
    async () => {
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
    },
    'nav -> Backends',
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Backends' })).toBeVisible();
  timeline.markStep('tab-switched');

  timeline.report();
});
