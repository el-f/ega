/* coverage: translation.smart-bubble.bubble-menu-turn-off */
import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  readStorage,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    bubbleFirstRunSeen: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

type Prefs = { sitePrefs: Record<string, { disabled?: boolean }> };

test('the bubble menu turns Ega off on this site, and Undo turns it back on', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  const origin = new URL(ext.serverUrl).origin;

  await selectArabiziParagraph(page);
  await expect.poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0).toBe(1);
  expect(await egaTest<boolean>(page, 'clickBubbleMenu')).toBe(true);
  const menu = page.locator('[data-ega-bubble-menu] [role="menu"]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveText(['Turn off on this site', 'Bubble settings']);
  timeline.markStep('menu-open');

  await menu.getByRole('menuitem', { name: 'Turn off on this site' }).click();
  const toast = page.locator('.ega-toast');
  await expect(toast).toContainText('Turn it back on from the Ega toolbar button.');
  await expect.poll(async () => egaTest<number>(page, 'bubbleCount')).toBe(0);
  await expect
    .poll(async () => {
      const s = await readStorage<Prefs>(ext.context, ext.extensionId, 'ega.settings');
      return s?.sitePrefs[origin]?.disabled === true;
    })
    .toBe(true);
  timeline.markStep('site-off');

  await toast.locator('[data-ega-toast-action]').click();
  await expect
    .poll(async () => {
      const s = await readStorage<Prefs>(ext.context, ext.extensionId, 'ega.settings');
      return s !== null && !(origin in s.sitePrefs);
    })
    .toBe(true);
  timeline.markStep('undone');
});
