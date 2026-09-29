/* coverage: options.glossary.add-entry-with-lang-scope */
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

test('add entry with source/target lang and case-sensitive stores all fields', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-glossary').click();
  timeline.markStep('glossary-tab-open');

  await page.getByLabel('Term').fill('Brand');
  await page.getByLabel('Translation').fill('Marque');

  await page.locator('select[aria-label="Source language scope"]').selectOption('en');
  await page.locator('select[aria-label="Target language scope"]').selectOption('fr');

  const caseSensitive = page.locator('input#glossary-case-sensitive');
  await expect(caseSensitive).not.toBeChecked();
  await caseSensitive.click();
  await expect(caseSensitive).toBeChecked();
  timeline.markStep('fields-filled');

  await page.locator('button.ega-btn.variant-primary', { hasText: 'Add entry' }).click();
  timeline.markStep('submitted');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const list = s?.glossary ?? [];
        return list.find((e) => e.term === 'Brand' && e.translation === 'Marque') ?? null;
      },
      { timeout: 5_000 },
    )
    .toMatchObject({
      term: 'Brand',
      translation: 'Marque',
      sourceLang: 'en',
      targetLang: 'fr',
      caseSensitive: true,
    });
  timeline.markStep('persisted');
  timeline.report();
});
