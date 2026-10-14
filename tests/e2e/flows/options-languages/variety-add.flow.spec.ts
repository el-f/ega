/* coverage: options.languages.variety-add */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('Add language opens a dialog that saves the language once it has a name and notes', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-languages').click();

  await page.locator('[data-ega-language-add]').click();
  const dialog = page.locator('[data-ega-language-dialog="new"]');
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-ega-dialog-status]')).toHaveText('Not saved yet: add a name');
  timeline.markStep('form-opened');

  await dialog.getByLabel('Name').fill('TestPidgin');
  await dialog.getByLabel('Notes').fill('A test variety hint that is long enough.');
  await page.locator('[data-ega-dialog-done]').click();
  timeline.markStep('submitted');

  await expect
    .poll(
      async () => {
        const customs = await readStorage<unknown>(
          ext.context,
          ext.extensionId,
          'ega.customLanguages',
        );
        if (!Array.isArray(customs)) return false;
        return customs.some((c) => (c as { label?: string }).label === 'TestPidgin');
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  await expect(page.locator('[data-ega-variety-row]', { hasText: 'TestPidgin' })).toContainText(
    'Custom',
  );
});
