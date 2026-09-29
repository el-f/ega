/* coverage: options.context-menu.manage */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';

let ext: ExtensionHandle;

interface CmSettings {
  contextMenuItems?: { id: string; kind: string; order: number; enabled: boolean }[];
  contextMenuLayout?: string;
}

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('manage: preview, add-image, reorder, layout + reset persist', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  // Translate tab is active by default; the manager mounts there.
  const rows = page.locator('[data-ega-cm-row]');
  await expect(rows.first()).toBeVisible({ timeout: 5_000 });
  const initialCount = await rows.count();
  expect(initialCount).toBeGreaterThan(0);

  await expect(page.locator('[data-ega-cm-handle]')).toHaveCount(initialCount);

  await page.locator('[data-ega-cm-add-image]').click();
  await expect(rows).toHaveCount(initialCount + 1);
  await expect
    .poll(async () => {
      const s = await readStorage<CmSettings>(ext.context, ext.extensionId, 'ega.settings');
      return s?.contextMenuItems?.some(
        (i) => i.kind === 'image-task' && i.id.startsWith('ega-custom-'),
      );
    })
    .toBe(true);

  const firstId = await rows.first().getAttribute('data-ega-cm-id');
  expect(firstId).toBeTruthy();
  await rows.first().locator('[data-ega-cm-down]').click();
  await expect
    .poll(async () => {
      const s = await readStorage<CmSettings>(ext.context, ext.extensionId, 'ega.settings');
      const ordered = (s?.contextMenuItems ?? []).slice().sort((a, b) => a.order - b.order);
      return ordered[1]?.id; // moved from index 0 to index 1
    })
    .toBe(firstId);

  await page.locator('[data-ega-cm-layout] [role="radio"][data-value="flat"]').click();
  await expect
    .poll(async () => {
      const s = await readStorage<CmSettings>(ext.context, ext.extensionId, 'ega.settings');
      return s?.contextMenuLayout;
    })
    .toBe('flat');

  const reset = page.locator('[data-ega-section-reset]');
  await expect(reset).toBeVisible();
  await reset.click();
  await expect
    .poll(async () => {
      const s = await readStorage<CmSettings>(ext.context, ext.extensionId, 'ega.settings');
      return s?.contextMenuLayout;
    })
    .toBe('nested');
  await expect(reset).toBeHidden();
});
