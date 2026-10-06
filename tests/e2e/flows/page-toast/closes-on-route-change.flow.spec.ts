/* coverage: translation.page-toast.closes-on-route-change */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { assertStaysStable, createTimeline } from '../_harness';

const NOTICE = 'Select some text first, then press the shortcut.';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    shortcut: 'Ctrl+Shift+L',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test("a notice that waits for the user closes when the page's own router changes the route", async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/spa-page.html`);
  await waitForTestHooks(page);
  // pushState from the page fires neither popstate nor hashchange, so only the Navigation API can see it.
  await page.evaluate(() => {
    const w = window as Window & { navEvents?: number };
    w.navEvents = 0;
    const count = (): void => void (w.navEvents = (w.navEvents ?? 0) + 1);
    window.addEventListener('popstate', count);
    window.addEventListener('hashchange', count);
  });

  // Nothing is selected, so the shortcut shows a notice that stays until dismissed.
  await page.keyboard.press('Control+Shift+L');
  const notice = page.locator('[data-ega-toast-wrap]');
  await expect(notice).toContainText(NOTICE);
  timeline.markStep('notice-shown');

  // A replace keeps the same route, so the notice stays.
  await page.locator('#filter').click();
  await expect(page).toHaveURL(/\?filter=1$/);
  await assertStaysStable(async () => await notice.count(), 1, {
    windowMs: 1_000,
    message: 'a replaceState on the same route must leave the notice up',
  });

  await page.locator('#next').click();
  await expect(page).toHaveURL(/\/next-route$/);
  await expect(page.locator('h1')).toHaveText('Second route');
  await expect(notice).toHaveCount(0);
  timeline.markStep('route-changed-notice-closed');

  expect(await page.evaluate(() => (window as Window & { navEvents?: number }).navEvents)).toBe(0);
});
