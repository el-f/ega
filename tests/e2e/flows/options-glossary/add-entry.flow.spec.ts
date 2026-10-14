/* coverage: options.glossary.add-entry */
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

test('Add glossary entry persists to settings.glossary', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-glossary').click();
  timeline.markStep('glossary-active');
  // The tasks that send the glossary are named above the add row.
  await expect(page.locator('[data-ega-glossary-used-by]')).toContainText('Translate, Explain');

  await page.getByLabel('Term').fill('Foo');
  await page.getByLabel('Translation').fill('Bar');
  await page.locator('[data-ega-glossary-add-button]').click();
  timeline.markStep('submitted');

  await expect
    .poll(
      async () => {
        const s = await readStorage<{ glossary?: Array<{ term?: string; translation?: string }> }>(
          ext.context,
          ext.extensionId,
          'ega.settings',
        );
        const list = s?.glossary;
        if (!Array.isArray(list)) return false;
        return list.some((e) => e.term === 'Foo' && e.translation === 'Bar');
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  await expect(page.locator('[data-ega-glossary-list]')).toContainText('Foo → Bar');
  await expect(page.getByLabel('Term')).toBeFocused();
});
