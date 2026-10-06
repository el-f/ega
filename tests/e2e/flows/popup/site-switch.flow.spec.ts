/* coverage: translation.popup.site-switch */
import { test, expect, type Page } from '@playwright/test';
import {
  launchExtension,
  readStorage,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'test-key' });
});

test.afterEach(async () => {
  await ext.close();
});

/** Opens the popup as a tab whose "active tab" is the fixture page, as a real toolbar popup sees it. */
async function openPopupOver(fixtureUrl: string): Promise<Page> {
  const popup = await ext.context.newPage();
  await popup.addInitScript((url: string) => {
    const tabs = chrome.tabs;
    const real = tabs.query.bind(tabs);
    tabs.query = (async () =>
      (await real({})).filter((t) => t.url?.startsWith(url))) as typeof tabs.query;
  }, fixtureUrl);
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  return popup;
}

test('the site switch turns Ega off for this site and back on, with the reason shown', async () => {
  const timeline = createTimeline();
  const content = await ext.context.newPage();
  const url = `${ext.serverUrl}/selection-page.html`;
  await content.goto(url);
  await waitForTestHooks(content);
  const origin = new URL(url).origin;
  const host = new URL(url).hostname;
  timeline.markStep('content-ready');

  const popup = await openPopupOver(ext.serverUrl);
  const sw = popup.getByRole('switch', { name: `Ega on ${host}` });
  await expect(sw).toBeChecked({ timeout: 5_000 });
  timeline.markStep('switch-on');

  await sw.click();
  await expect(popup.getByText("Ega won't translate on this site.")).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Translate page' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect
    .poll(async () => {
      const s = await readStorage<{ sitePrefs: Record<string, { disabled?: boolean }> }>(
        ext.context,
        ext.extensionId,
        'ega.settings',
      );
      return s?.sitePrefs[origin]?.disabled === true;
    })
    .toBe(true);
  timeline.markStep('switched-off');

  // A reopened popup reads the state from settings.
  await popup.close();
  const again = await openPopupOver(ext.serverUrl);
  const sw2 = again.getByRole('switch', { name: `Ega on ${host}` });
  await expect(sw2).not.toBeChecked({ timeout: 5_000 });
  await sw2.click();
  await expect(again.getByText("Ega won't translate on this site.")).toHaveCount(0);
  await expect
    .poll(async () => {
      const s = await readStorage<{ sitePrefs: Record<string, unknown> }>(
        ext.context,
        ext.extensionId,
        'ega.settings',
      );
      return s !== null && !(origin in s.sitePrefs);
    })
    .toBe(true);
  timeline.markStep('switched-on');
});
