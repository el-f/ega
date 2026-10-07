/* coverage: options.site-overrides-review.clear-all */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    sitePrefs: {
      'a.example.com': { disabled: true },
      'b.example.com': { disabled: false },
      'c.example.com': { disabled: true },
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Remove all wipes every sitePrefs entry at once, and Undo puts them back', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Advanced"]').click();
  await page.locator('[data-ega-subtab="data"]').click();
  timeline.markStep('data-tab-open');

  const list = page.locator('[data-ega-site-overrides-review]');
  await expect(list).toBeVisible({ timeout: 10_000 });
  // Each legacy bare host repairs into https:// + http://; equal prefs show as one row.
  const rows = page.locator('[data-ega-site-override-row]');
  await expect(rows).toHaveCount(3);
  expect(
    await rows.evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-ega-site-override-host') ?? ''),
    ),
  ).toEqual(['a.example.com', 'b.example.com', 'c.example.com']);

  await page.locator('[data-ega-site-override-clear-all]').click();
  timeline.markStep('removed');
  await expect(page.locator('.ega-dialog')).toHaveCount(0);

  const count = async (): Promise<number> => {
    const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
    return Object.keys(s?.sitePrefs ?? {}).length;
  };
  await expect.poll(count, { timeout: 10_000 }).toBe(0);
  await expect(page.getByText('No site overrides yet')).toBeVisible();

  const toast = page.locator('[data-sonner-toast]', { hasText: 'Removed 3 site overrides' });
  await toast.getByRole('button', { name: 'Undo' }).click();
  timeline.markStep('undone');
  await expect.poll(count, { timeout: 10_000 }).toBe(6);
  await expect(rows).toHaveCount(3);
});

test('a host whose two schemes differ stays two rows, and clearing one keeps the other', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    sitePrefs: {
      'https://split.example.com': { disabled: true },
      'http://split.example.com': { disabled: false },
    },
  });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Advanced"]').click();
  await page.locator('[data-ega-subtab="data"]').click();

  const rows = page.locator('[data-ega-site-override-row]');
  await expect(rows).toHaveCount(2, { timeout: 10_000 });
  expect(
    await rows.evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-ega-site-override-host') ?? ''),
    ),
  ).toEqual(['http://split.example.com', 'https://split.example.com']);
  // Only the https entry is off; merging the pair would hide that.
  await expect(rows.nth(0).locator('[data-ega-site-override-state]')).toHaveText('');
  await expect(rows.nth(1).locator('[data-ega-site-override-state]')).toHaveText('Ega is off');

  await rows.nth(1).locator('[data-ega-site-override-clear]').click();

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return Object.keys(s?.sitePrefs ?? {}).sort();
      },
      { timeout: 10_000 },
    )
    .toEqual(['http://split.example.com']);
});
