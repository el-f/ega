/* coverage: options.languages.variety-import */
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

test.slow();

test('Import languages JSON replaces customLanguages and shows imported counts', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-languages').click();
  timeline.markStep('tab-open');

  const importBundle = JSON.stringify({
    egaVarieties: {
      v: 1,
      exportedAt: new Date().toISOString(),
      customLanguages: [
        {
          id: 'import-test-lang',
          label: 'ImportedLang',
          hint: 'Seeded by import test.',
          examples: [],
          createdAt: Date.now(),
        },
      ],
      varietyOverrides: {},
      disabledVarieties: [],
    },
  });

  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5_000 });
  await page.locator('label', { hasText: 'Import languages' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'ega-varieties-test.json',
    mimeType: 'application/json',
    buffer: Buffer.from(importBundle),
  });
  timeline.markStep('file-chosen');

  const dialog = page.locator('.ega-dialog', {
    hasText: 'Replace your custom languages and edits?',
  });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByRole('button', { name: 'Replace', exact: true }).click();
  timeline.markStep('confirmed');

  await expect(page.locator('[role="status"]', { hasText: 'Imported' })).toBeVisible({
    timeout: 8_000,
  });

  await expect
    .poll(
      async () => {
        const customs = await readStorage<unknown>(
          ext.context,
          ext.extensionId,
          'ega.customLanguages',
        );
        if (!Array.isArray(customs)) return false;
        return customs.some((c) => (c as { label?: string }).label === 'ImportedLang');
      },
      { timeout: 10_000 },
    )
    .toBe(true);
});
