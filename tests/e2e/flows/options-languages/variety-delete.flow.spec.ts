/* coverage: options.languages.variety-delete */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  openLanguageDialog,
  readStorage,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('Delete language in the dialog removes it, and Undo puts it back', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.evaluate(async () => {
    const entry = {
      id: 'delete-me-id',
      label: 'DeleteMe',
      hint: 'Will be deleted in the next assertion.',
      examples: [],
      createdAt: Date.now(),
    };
    await chrome.storage.local.set({ 'ega.customLanguages': [entry] });
  });
  const dialog = await openLanguageDialog(page, 'delete-me-id', 'DeleteMe');
  timeline.markStep('seeded');

  // The footer sits outside the dialog body, so the button is found on the page.
  await page.locator('[data-ega-language-delete]').click();
  timeline.markStep('deleted');
  await expect(dialog).toHaveCount(0);

  const customs = async (): Promise<number> => {
    const list = await readStorage<unknown>(ext.context, ext.extensionId, 'ega.customLanguages');
    return Array.isArray(list) ? list.length : -1;
  };
  await expect.poll(customs, { timeout: 5_000 }).toBe(0);

  const undo = page
    .locator('[data-sonner-toast]', { hasText: 'Deleted "DeleteMe"' })
    .getByRole('button', { name: 'Undo' });
  await undo.click();
  await expect.poll(customs, { timeout: 5_000 }).toBe(1);
  timeline.markStep('restored');
});
