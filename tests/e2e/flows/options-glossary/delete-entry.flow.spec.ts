/* coverage: options.glossary.delete-entry */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    glossary: [{ term: 'DeleteMe', translation: 'PleaseGo', caseSensitive: false }],
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Delete entry in the open row removes the glossary entry from storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-glossary').click();
  timeline.markStep('glossary-tab-open');

  const list = page.locator('[data-ega-glossary-list]');
  await expect(list).toBeVisible({ timeout: 5_000 });
  await expect(list).toContainText('DeleteMe');

  const edit = list.locator('[data-ega-glossary-edit]').first();
  await expect(edit).toHaveAccessibleName('Edit entry DeleteMe');
  await edit.click();
  await expect(edit).toHaveAttribute('aria-expanded', 'true');
  const editor = page.locator('[data-ega-glossary-editor]');
  await expect(editor.getByLabel('Term')).toBeFocused();
  const deleteBtn = editor.locator('button[aria-label="Delete entry DeleteMe"]');
  await expect(deleteBtn).toBeVisible();
  await deleteBtn.click();
  timeline.markStep('delete-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const glossary = s?.glossary ?? [];
        return glossary.some((e) => e.term === 'DeleteMe');
      },
      { timeout: 5_000 },
    )
    .toBe(false);

  await expect(list).not.toBeVisible({ timeout: 3_000 });
  timeline.markStep('entry-removed');
  timeline.report();
});
