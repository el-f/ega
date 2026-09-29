import { test, expect } from '@playwright/test';
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
});

test.afterEach(async () => {
  await ext.close();
});

test('a mouse drag that does not cross the divider keeps the backend visible', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    ...onlyBackends('anthropic', 'native'),
  });

  const page = await ext.context.newPage();
  // A throw inside the drop handler aborts svelte-dnd-action's cleanup and orphans the drag clone.
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('[data-tooltip="Backends"]').click();
  await expect(page.locator('.be-list')).toBeVisible({ timeout: 5_000 });

  const anthropicRow = page.getByTestId('be-row-anthropic');
  await expect(anthropicRow).toBeVisible({ timeout: 5_000 });

  // Many small steps: svelte-dnd-action needs them to run its full consider/finalize cycle.
  const box = await anthropicRow.boundingBox();
  if (!box) throw new Error('anthropic row had no bounding box');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // 10px clears the library's distance threshold but stays inside the same slot.
  await page.mouse.move(startX + 10, startY + 5, { steps: 4 });
  await page.mouse.move(startX, startY, { steps: 4 });
  await page.mouse.up();

  expect(pageErrors).toEqual([]);

  // A leftover drag clone means cleanupPostDrop never finished and the row looks duplicated.
  await expect(page.locator('#dnd-action-dragged-el')).toHaveCount(0, { timeout: 2_000 });

  await expect(anthropicRow).toHaveCount(1);
  await expect(anthropicRow).toBeVisible({ timeout: 2_000 });

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.backendOrder ?? [];
      },
      { timeout: 4_000, intervals: [200, 300, 500] },
    )
    .toContain('anthropic');

  const settingsAfter = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  expect(settingsAfter?.disabledBackends ?? []).not.toContain('anthropic');
});
