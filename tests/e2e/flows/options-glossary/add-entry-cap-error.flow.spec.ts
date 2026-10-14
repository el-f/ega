/* coverage: options.glossary.add-entry-cap-error */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

function makeEntries(
  count: number,
): Array<{ term: string; translation: string; caseSensitive: boolean }> {
  return Array.from({ length: count }, (_, i) => ({
    term: `Term${i}`,
    translation: `Translation${i}`,
    caseSensitive: false,
  }));
}

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { glossary: makeEntries(200) });
});

test.afterEach(async () => {
  await ext.close();
});

test('at 200 entries Add stays focusable, says why, and writes nothing', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-glossary').click();
  timeline.markStep('glossary-tab-open');

  const addForm = page.locator('[data-ega-glossary-add]');
  await addForm.getByLabel('Term').fill('OverCap');
  await addForm.getByLabel('Translation').fill('ShouldFail');

  const add = page.locator('[data-ega-glossary-add-button]');
  await expect(add).toHaveAttribute('aria-disabled', 'true');
  await expect(add).toHaveAccessibleDescription(
    'The glossary holds 200 entries, the most Ega keeps',
  );
  // Playwright will not click an aria-disabled button; a keyboard user still can press it.
  await add.focus();
  await expect(add).toBeFocused();
  await page.keyboard.press('Enter');
  timeline.markStep('add-clicked');
  await expect(page.locator('[data-ega-glossary-cap]')).toBeVisible();
  timeline.markStep('error-visible');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return (s?.glossary ?? []).length;
      },
      { timeout: 3_000 },
    )
    .toBe(200);
  timeline.markStep('count-unchanged');
  timeline.report();
});
