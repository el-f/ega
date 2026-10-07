/* coverage: translation.popup.restricted-page */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'test-key' });
});

test.afterEach(async () => {
  await ext.close();
});

test('on a page no extension may touch, the page actions say why and send nothing', async () => {
  const timeline = createTimeline();
  const popup = await ext.context.newPage();
  // The active tab is the extensions page; every message the popup sends a tab is counted.
  await popup.addInitScript(() => {
    const g = globalThis as unknown as {
      chrome: { tabs: { query: unknown; sendMessage: unknown } };
      __sent: string[];
    };
    g.__sent = [];
    g.chrome.tabs.query = async () => [{ id: 7, url: 'chrome://extensions/', windowId: 1 }];
    g.chrome.tabs.sendMessage = async (_id: number, msg: { kind: string }) => {
      g.__sent.push(msg.kind);
      return undefined;
    };
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  const status = popup.locator('[data-ega-popup-status="restricted"]');
  await expect(status).toContainText("Ega can't run on this page.");
  await expect(popup.getByRole('switch')).toHaveCount(0);
  timeline.markStep('restricted-shown');

  const statusId = await status.locator('p').getAttribute('id');
  for (const name of ['Translate page', 'Choose areas', 'Pick element']) {
    const action = popup.getByRole('button', { name });
    await expect(action).toHaveAttribute('aria-disabled', 'true');
    await expect(action).toHaveAttribute('aria-describedby', statusId ?? '');
  }
  for (const name of ['Translate clipboard', 'Open side panel']) {
    await expect(popup.getByRole('button', { name })).not.toHaveAttribute('aria-disabled', 'true');
  }
  timeline.markStep('actions-described');

  // A blocked action stays focusable and does nothing when pressed; force skips Playwright's own aria-disabled wait.
  await popup.getByRole('button', { name: 'Translate page' }).click({ force: true });
  await popup.getByRole('button', { name: 'Choose areas' }).click({ force: true });
  const sent = await popup.evaluate(() => (globalThis as unknown as { __sent: string[] }).__sent);
  expect(sent.filter((k) => k === 'page:translateAll' || k === 'page:chooseAreas')).toEqual([]);
  await expect(popup.getByRole('button', { name: 'Translate page' })).toBeVisible();
  timeline.markStep('nothing-sent');
});
