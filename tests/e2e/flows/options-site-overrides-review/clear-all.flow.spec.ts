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

test('Clear all wipes every sitePrefs entry after confirm', async () => {
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
  const dialog = page.locator('.ega-dialog', { hasText: 'Clear all site overrides' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByRole('button', { name: 'Clear all', exact: true }).click();
  timeline.markStep('confirmed');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return Object.keys(s?.sitePrefs ?? {}).length;
      },
      { timeout: 10_000 },
    )
    .toBe(0);
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
  // Only the https entry is paused; merging the pair would hide that.
  await expect(rows.nth(0).locator('[data-ega-site-pill-paused]')).toHaveCount(0);
  await expect(rows.nth(1).locator('[data-ega-site-pill-paused]')).toHaveCount(1);

  await rows.nth(1).locator('[data-ega-site-override-clear]').click();
  const dialog = page.locator('.ega-dialog', { hasText: 'Clear site override' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByRole('button', { name: 'Clear', exact: true }).click();

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
