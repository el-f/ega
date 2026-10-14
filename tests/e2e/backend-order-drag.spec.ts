import { test, expect, type Page } from '@playwright/test';
import {
  launchExtension,
  onlyBackends,
  readStorage,
  seedSettings,
  type ExtensionHandle,
} from './helpers';
import type { Settings } from '../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { ...onlyBackends('anthropic', 'native') });
});

test.afterEach(async () => {
  await ext.close();
});

async function openBackends(page: Page): Promise<void> {
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('[data-tooltip="Backends"]').click();
  // Each card opens or stays shut once its status probe answers; a grip measured before that moves under the cursor.
  await expect(page.getByTestId('be-row-anthropic')).toContainText(/needs setup/i, {
    timeout: 5_000,
  });
  await expect(page.getByTestId('be-row-native')).toContainText(/not installed/i);
}

/** Presses the ⋮⋮ grip (the only drag handle) and starts the drag with a short move; small steps let svelte-dnd-action run its consider cycle. */
async function startGripDrag(page: Page, id: string): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId(`be-row-${id}`).locator('.be-gutter').boundingBox();
  if (!box) throw new Error(`${id} grip had no bounding box`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // 10px clears the library's distance threshold, so a drag really starts; the clone proves it.
  await page.mouse.move(x + 10, y + 5, { steps: 4 });
  await expect(page.locator('#dnd-action-dragged-el')).toHaveCount(1);
  return { x, y };
}

async function storedOrder(): Promise<string[]> {
  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  return s?.backendOrder ?? [];
}

test('dragging the grip below the next backend reorders the chain', async () => {
  const page = await ext.context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await openBackends(page);
  expect((await storedOrder()).slice(0, 2)).toEqual(['anthropic', 'native']);

  const { x } = await startGripDrag(page, 'anthropic');
  // Measured mid-drag: the rows below move up into the dragged card's space. The cursor decides the drop.
  const native = await page.getByTestId('be-row-native').boundingBox();
  if (!native) throw new Error('native row had no bounding box');
  await page.mouse.move(x, native.y + native.height * 0.75, { steps: 20 });
  await page.mouse.up();

  await expect.poll(async () => (await storedOrder()).slice(0, 2)).toEqual(['native', 'anthropic']);
  await expect(page.getByTestId('be-row-native').locator('.be-pos')).toHaveText('1');
  await expect(page.getByTestId('be-row-anthropic').locator('.be-pos')).toHaveText('2');
  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  expect(s?.disabledBackends ?? []).not.toContain('anthropic');
  expect(pageErrors).toEqual([]);
});

test('a grip drag that returns to its own slot keeps the order and the row', async () => {
  const page = await ext.context.newPage();
  // A throw inside the drop handler aborts svelte-dnd-action's cleanup and orphans the drag clone.
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await openBackends(page);

  const { x, y } = await startGripDrag(page, 'anthropic');
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.up();

  expect(pageErrors).toEqual([]);
  // A leftover drag clone means cleanupPostDrop never finished and the row looks duplicated.
  await expect(page.locator('#dnd-action-dragged-el')).toHaveCount(0, { timeout: 2_000 });
  await expect(page.getByTestId('be-row-anthropic')).toHaveCount(1);
  await expect(page.getByTestId('be-row-anthropic')).toBeVisible();
  await expect(page.getByTestId('be-row-anthropic').locator('.be-pos')).toHaveText('1');
  expect((await storedOrder()).slice(0, 2)).toEqual(['anthropic', 'native']);
});
