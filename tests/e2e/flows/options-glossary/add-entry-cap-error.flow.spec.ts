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

test('adding an entry when glossary is at 200 shows cap error and writes nothing', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-glossary').click();
  timeline.markStep('glossary-tab-open');

  const addForm = page.locator('[data-ega-glossary-add]');
  await addForm.getByLabel('Term').fill('OverCap');
  await addForm.getByLabel('Translation').fill('ShouldFail');

  await page.locator('button.ega-btn.variant-primary', { hasText: 'Add entry' }).click();
  timeline.markStep('add-clicked');

  // Scope to the glossary error specifically — other surfaces (StatusBar) can
  // carry a role="alert" too, which made a bare [role="alert"] match 2 elements.
  const errorMsg = page.locator('.glossary-error[role="alert"]');
  await expect(errorMsg).toBeVisible({ timeout: 5_000 });
  await expect(errorMsg).toContainText('Glossary limit is 200 entries');
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
