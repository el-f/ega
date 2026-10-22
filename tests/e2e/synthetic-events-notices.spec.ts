import { test, expect, type Page } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';
import { assertStaysStable } from './flows/_harness';

// Ega's shadow root is open, so a page script can click its notices and menu items. None may flip the site switch.
let ext: ExtensionHandle;
let origin: string;

test.beforeEach(async () => {
  ext = await launchExtension();
  origin = new URL(ext.serverUrl).origin;
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    bubbleFirstRunSeen: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

/** Read through the service worker: an options page per poll would be slow and would take focus. */
async function siteOff(): Promise<boolean> {
  const sw = ext.context.serviceWorkers()[0];
  if (!sw) throw new Error('no service worker');
  return sw.evaluate(async (o) => {
    const r = await chrome.storage.local.get('ega.settings');
    const s = r['ega.settings'] as
      { sitePrefs?: Record<string, { disabled?: boolean }> } | undefined;
    return s?.sitePrefs?.[o]?.disabled === true;
  }, origin);
}

/** A click from the page's own script: the event is not trusted. */
async function pageClick(page: Page, selector: string): Promise<void> {
  const clicked = await page.evaluate((sel) => {
    const el = document
      .querySelector('#ega-shadow-host')
      ?.shadowRoot?.querySelector<HTMLElement>(sel);
    el?.click();
    return el !== null && el !== undefined;
  }, selector);
  expect(clicked, `${selector} is there to click`).toBe(true);
}

test('a page script cannot press Turn on in the site-off notice; the user can', async () => {
  await seedSettings(ext.context, ext.extensionId, { sitePrefs: { [origin]: { disabled: true } } });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  const action = page.locator('[data-ega-toast-action]');
  await expect(action).toHaveText('Turn on');

  await pageClick(page, '[data-ega-toast-action]');
  await assertStaysStable(() => siteOff(), true, { windowMs: 1_500 });
  await expect(page.locator('.ega-toast')).toContainText(`Ega is off on`);

  await action.click();
  await expect.poll(() => siteOff()).toBe(false);
});

test('a page script cannot choose a bubble menu item; the user can', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await selectArabiziParagraph(page);
  await expect.poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0).toBe(1);
  expect(await egaTest<boolean>(page, 'clickBubbleMenu')).toBe(true);
  const menu = page.locator('[data-ega-bubble-menu] [role="menu"]');
  await expect(menu).toBeVisible();

  // The first top-level button is Turn off on this site; Run task sits in its own wrapper.
  await pageClick(page, '[data-ega-bubble-menu] .bubble-menu > button[role="menuitem"]');
  await assertStaysStable(() => siteOff(), false, { windowMs: 1_500 });
  await expect(menu).toBeVisible();

  await menu.getByRole('menuitem', { name: 'Turn off on this site' }).click();
  await expect.poll(() => siteOff()).toBe(true);
});

test('a page script cannot open Run task or run a task from it; the user can', async () => {
  const api = mockAnthropic(ext.context, { translation: 'A short summary.' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await selectArabiziParagraph(page);
  await expect.poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0).toBe(1);
  expect(await egaTest<boolean>(page, 'clickBubbleMenu')).toBe(true);
  const tasks = page.getByRole('menu', { name: 'Run task' });
  await expect(page.getByRole('menuitem', { name: 'Run task' })).toBeVisible();

  await pageClick(page, '[data-ega-bubble-menu] .bubble-sub-parent');
  await assertStaysStable(() => tasks.count(), 0, { windowMs: 1_000 });
  await page.evaluate(() => {
    document
      .querySelector('#ega-shadow-host')
      ?.shadowRoot?.querySelector('.bubble-sub-parent')
      ?.dispatchEvent(new PointerEvent('pointerenter'));
  });
  await assertStaysStable(() => tasks.count(), 0, { windowMs: 1_000 });

  await page.getByRole('menuitem', { name: 'Run task' }).click();
  await expect(tasks).toBeVisible();
  await pageClick(page, '[data-ega-bubble-menu] [aria-label="Run task"] [role="menuitem"]');
  await assertStaysStable(() => api.calls(), 0, { windowMs: 1_500 });
  expect(await egaTest<number>(page, 'bubbleCount')).toBe(1);

  await tasks.getByRole('menuitem', { name: 'Summarize' }).click();
  await expect.poll(() => api.calls()).toBeGreaterThan(0);
});
