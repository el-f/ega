/* coverage: translation.sidepanel.save-failed-banner */
import { test, expect } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

// Only `ega:conv:` writes fail, so the panel still boots on its settings.
const FAIL_CONVERSATION_WRITES = `
  globalThis.__egaFailConvWrites = true;
  if (globalThis.chrome?.storage?.local) {
    const area = chrome.storage.local;
    const realSet = area.set.bind(area);
    area.set = (items, cb) => {
      const hitsThread = Object.keys(items ?? {}).some((k) => k.startsWith('ega:conv:'));
      if (globalThis.__egaFailConvWrites && hitsThread) {
        const err = new Error('QUOTA_BYTES quota exceeded');
        if (typeof cb === 'function') { cb(); return undefined; }
        return Promise.reject(err);
      }
      return realSet(items, cb);
    };
  }
`;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('a conversation that cannot be saved says so, and Try again clears it only once the write lands', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Welcome.' });

  const page = await ext.context.newPage();
  await page.addInitScript(FAIL_CONVERSATION_WRITES);
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  const banner = page.locator('[data-ega-save-failed]');
  await expect(banner).toHaveCount(0);

  // A real turn is the real producer of the save — nothing sets saveFailed by hand.
  await page.locator('#sp-text').fill('hola');
  await page.locator('#sp-text').press('Enter');
  await expect(page.locator('.ega-answer').first()).toContainText('Welcome', {
    timeout: 10_000,
  });
  timeline.markStep('turn-done');

  await expect(banner).toBeVisible({ timeout: 10_000 });
  // A quota error names the fix: free some room.
  await expect(banner).toContainText('Storage is full. Delete old conversations to make room.');
  await expect(banner).toHaveAttribute('role', 'status');
  timeline.markStep('banner-visible');

  const retry = page.locator('[data-ega-save-failed-retry]');
  await expect(retry).toBeVisible();

  // Storage is still full, so the banner has to stay up; the failure toast proves the retry already ran.
  await retry.click();
  await expect(page.getByText(/Still (out of space|could not save)/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(banner).toBeVisible();
  timeline.markStep('retry-still-failing');

  // Room again: the same button is what gets the user back to a saved thread.
  await page.evaluate(() => {
    (globalThis as unknown as { __egaFailConvWrites: boolean }).__egaFailConvWrites = false;
  });
  await retry.click();
  await expect(banner).toHaveCount(0, { timeout: 10_000 });
  timeline.markStep('retry-recovered');

  // The turns really are on disk now, not just off the banner.
  const saved = await page.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    return Object.keys(all).filter((k) => k.startsWith('ega:conv:t:')).length;
  });
  expect(saved).toBeGreaterThan(0);
});
