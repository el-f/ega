/* coverage: options.site-overrides-review.clear-host */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

// sitePrefs keys are origins; a bare host is repaired to one on read and would not match the row.
const HOST = 'https://flow-clear.example.com';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    sitePrefs: { [HOST]: { disabled: true } },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Remove on a row takes the host out of sitePrefs at once, with Undo', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Advanced"]').click();
  await page.locator('[data-ega-subtab="data"]').click();
  timeline.markStep('data-tab-open');

  const row = page.locator(`[data-ega-site-override-row][data-ega-site-override-host="${HOST}"]`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.locator('[data-ega-site-override-clear]').click();
  timeline.markStep('removed');
  await expect(page.locator('.ega-dialog')).toHaveCount(0);
  await expect(page.locator('[data-sonner-toast]', { hasText: 'Removed' })).toContainText('Undo');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return Object.hasOwn(s?.sitePrefs ?? {}, HOST);
      },
      { timeout: 10_000 },
    )
    .toBe(false);
});

test('clearing a merged bare-host row removes both scheme entries', async () => {
  // A legacy bare host repairs into https:// + http://, and one row owns both.
  await seedSettings(ext.context, ext.extensionId, {
    sitePrefs: { 'merged.example.com': { disabled: true } },
  });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Advanced"]').click();
  await page.locator('[data-ega-subtab="data"]').click();

  const row = page.locator(
    '[data-ega-site-override-row][data-ega-site-override-host="merged.example.com"]',
  );
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.locator('[data-ega-site-override-clear]').click();

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return Object.keys(s?.sitePrefs ?? {});
      },
      { timeout: 10_000 },
    )
    .toEqual([]);
});
