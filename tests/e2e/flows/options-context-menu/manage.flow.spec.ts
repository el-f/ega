/* coverage: options.context-menu.manage */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';

let ext: ExtensionHandle;

interface CmSettings {
  contextMenuItems?: { id: string; kind: string; order: number; enabled: boolean }[];
}

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

async function stored(): Promise<NonNullable<CmSettings['contextMenuItems']>> {
  const s = await readStorage<CmSettings>(ext.context, ext.extensionId, 'ega.settings');
  return (s?.contextMenuItems ?? []).slice().sort((a, b) => a.order - b.order);
}

test('manage: groups, add an image action, move inside a group, reset then undo', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-selection-bubble').click();

  const card = page.locator('[data-ega-setting="contextMenu.items"]');
  await expect(card.getByRole('heading', { name: 'Right-click menu' })).toBeVisible({
    timeout: 5_000,
  });
  for (const title of ['Selected text', 'Images', 'Page']) {
    await expect(card.getByRole('heading', { name: title, level: 3 })).toBeVisible();
  }
  await expect(card.locator('[data-ega-cm-layout]')).toHaveCount(0);
  await expect(card.locator('[data-ega-cm-preview]')).toHaveText(['Ega ▸', 'Ega ▸', 'Ega ▸']);
  await expect(card.locator('[data-ega-cm-site-note]')).toHaveText(
    'Shows "Enable Ega on this site" on sites where Ega is off',
  );
  // The grip is pointer only: Move up and Move down are the keyboard path.
  for (const grip of await card.locator('[data-ega-cm-handle]').all()) {
    await expect(grip).toHaveAttribute('tabindex', '-1');
    await expect(grip).toHaveAttribute('aria-hidden', 'true');
  }

  // The (i) opens on focus, closes on Esc, and a click pins it until a click outside.
  const info = card.locator('[data-ega-infotip]');
  await expect(info).toHaveAccessibleName('About the right-click menu');
  const bubble = page.locator('[data-ega-infotip-text]');
  await info.focus();
  await expect(bubble).toContainText('you can delete only items you added');
  await page.keyboard.press('Escape');
  await expect(bubble).toBeHidden();
  await info.click();
  await expect(bubble).toBeVisible();
  // A pinned tip leaves Esc to a shortcut field that is recording: Esc cancels the recording.
  const record = page.getByRole('button', { name: 'Record keyboard shortcut' });
  await record.focus();
  await page.keyboard.press('Enter');
  await expect(record).toHaveAttribute('aria-pressed', 'true');
  await expect(record).toHaveAttribute('data-ega-owns-escape');
  await expect(bubble).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(record).toHaveAttribute('aria-pressed', 'false');
  await card.getByRole('heading', { name: 'Images', level: 3 }).click();
  await expect(bubble).toBeHidden();

  // Add image action: the row lands in Images and opens on its Task.
  const images = card.locator('[data-ega-cm-group="image"] [data-ega-cm-row]');
  await expect(images).toHaveCount(2);
  await card.locator('[data-ega-cm-add-image]').click();
  await expect(images).toHaveCount(3);
  await expect
    .poll(async () =>
      (await stored()).some((i) => i.kind === 'image-task' && i.id.startsWith('ega-custom-')),
    )
    .toBe(true);
  await expect(images.nth(2).locator('[data-ega-cm-edit]')).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  // Move down inside Selected text; focus stays on the pressed button of the moved row.
  const first = card.locator('[data-ega-cm-id="ega-translate-selection"]');
  await first.getByRole('button', { name: 'Move Translate down' }).click();
  await expect
    .poll(async () => (await stored()).filter((i) => i.kind === 'task').map((i) => i.id))
    .toEqual(['ega-sidepanel-selection', 'ega-translate-selection']);
  await expect(first.locator('[data-ega-cm-down]')).toBeFocused();
  await expect(first.locator('[data-ega-cm-down]')).toHaveAttribute('aria-disabled', 'true');

  // Reset drops the added row, then Undo brings it back.
  const reset = card.locator('[data-ega-section-reset]');
  await reset.click();
  await expect(images).toHaveCount(2);
  await expect(reset).toBeHidden();
  await expect(
    card.locator('[data-ega-cm-group="selection"] [data-ega-cm-enabled]').first(),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(images).toHaveCount(3);
  await expect
    .poll(async () => (await stored()).filter((i) => i.kind === 'image-task').length)
    .toBe(3);
});
