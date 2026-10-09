/* coverage: integration.tooltip-sidepanel-escalation.escalation-then-copy */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  suppressSidePanelOpen,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../../helpers';
import { createTimeline, waitForVisibleText } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await suppressSidePanelOpen(ext.context, ext.extensionId);
  await ext.context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    contextEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('tooltip Pin seeds sidepanel; copy button writes pinned body to clipboard', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, {
    translation: 'Welcome friend.',
    explain: 'Greeting using arabizi script.',
  });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  await waitForVisibleText(page, '.tooltip .body', 'Welcome', { timeoutMs: 10_000 });
  timeline.markStep('tooltip-translated');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot ?? document;
          return root.querySelector('[data-ega-escalate="pin"]') !== null;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
  timeline.markStep('pin-visible');

  await page.locator('[data-ega-escalate="pin"]').click();

  // storage.session is extension-only, so the handoff slot needs an extension page to read it.
  const probe = await ext.context.newPage();
  await probe.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await expect
    .poll(
      async () =>
        await probe.evaluate(async () => {
          const r = (await chrome.storage.session.get('ega.pendingPopupHandoff')) as Record<
            string,
            unknown
          >;
          const slot = r['ega.pendingPopupHandoff'] as Record<string, unknown> | undefined;
          return slot ? Object.keys(slot).length : 0;
        }),
      { timeout: 5_000 },
    )
    .toBeGreaterThan(0);
  timeline.markStep('handoff-written');

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp.locator('.ega-user-turn').first()).toBeVisible({ timeout: 15_000 });
  const assistantBody = sp.locator('.ega-answer').first();
  await expect(assistantBody).toContainText('Welcome friend.', { timeout: 10_000 });
  await probe.close();
  timeline.markStep('sidepanel-seeded');

  // The newest reply keeps its action row in view; hover is how an older reply shows it.
  await sp.locator('[data-ega-reply]').first().hover();
  const actions = sp.locator('.ega-reply-actions').first();
  await expect(actions).toBeVisible({ timeout: 5_000 });
  timeline.markStep('actions-visible');

  const copyBtn = actions.getByRole('button', { name: 'Copy', exact: true });
  await expect(copyBtn).toBeVisible({ timeout: 2_000 });
  await copyBtn.click();
  timeline.markStep('copy-clicked');

  await expect(actions.getByRole('button', { name: 'Copied' })).toBeVisible({ timeout: 2_000 });

  // addDeliveredAssistantTurn writes the pinned body verbatim; it never passes through applyChunk.
  await sp.locator('body').focus();
  const clip = await sp.evaluate(async () => navigator.clipboard.readText());
  expect(clip).toBe('Welcome friend.');
  timeline.markStep('clipboard-asserted');
});
