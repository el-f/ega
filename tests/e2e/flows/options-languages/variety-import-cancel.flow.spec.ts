/* coverage: options.languages.variety-import-cancel */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import { assertStaysStable, createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();

  // Seed one known custom so we can assert it is NOT overwritten.
  const optionsPage = await ext.context.newPage();
  try {
    await optionsPage.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    await optionsPage.evaluate(async () => {
      const entry = {
        id: 'cancel-guard-lang',
        label: 'CancelGuard',
        hint: 'Must survive the canceled import.',
        examples: [],
        createdAt: Date.now(),
      };
      await chrome.storage.local.set({ 'ega.customLanguages': [entry] });
    });
  } finally {
    await optionsPage.close();
  }
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Canceling import confirm leaves customLanguages unchanged', async () => {
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
          id: 'would-replace',
          label: 'WouldReplace',
          hint: 'x',
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
    name: 'ega-varieties-cancel.json',
    mimeType: 'application/json',
    buffer: Buffer.from(importBundle),
  });
  timeline.markStep('file-chosen');

  const dialog = page.locator('.ega-dialog', {
    hasText: 'Replace your custom languages and edits?',
  });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  timeline.markStep('cancelled');

  // Status div must not appear after a cancel.
  await expect(page.locator('.backup-status')).not.toBeVisible({ timeout: 2_000 });

  // customLanguages must still contain our original entry.
  await assertStaysStable(
    async () => {
      const customs = await readStorage<unknown[]>(
        ext.context,
        ext.extensionId,
        'ega.customLanguages',
      );
      if (!Array.isArray(customs)) return null;
      return customs.some((c) => (c as { label?: string }).label === 'CancelGuard')
        ? 'present'
        : 'missing';
    },
    'present',
    { windowMs: 1_500 },
  );
});
