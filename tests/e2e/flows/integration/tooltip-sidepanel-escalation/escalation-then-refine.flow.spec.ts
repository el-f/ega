/* coverage: integration.tooltip-sidepanel-escalation.escalation-then-refine */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  suppressSidePanelOpen,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
  openReplyMenu,
} from '../../../helpers';
import { createTimeline, waitForVisibleText } from '../../_harness';

// The refine chip only works if the seeded turn carries a non-null `lastDispatch`.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await suppressSidePanelOpen(ext.context, ext.extensionId);
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

test('tooltip Pin seeds sidepanel; quick-refine [Shorter] spawns a variant', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, {
    translation: 'Welcome friend.',
    explain: 'Greeting in arabizi script.',
  });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  await waitForVisibleText(page, '.tooltip .body', 'Welcome', { timeoutMs: 10_000 });
  timeline.markStep('tooltip-translated');

  // The Pin button mounts only once tip.explain is populated.
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

  // The button lives in the shadow root, so click it from inside the page.
  await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot ?? document;
    (root.querySelector('[data-ega-escalate="pin"]') as HTMLButtonElement | null)?.click();
  });

  // storage.session is extension-only, so read it from an extension page.
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
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
  timeline.markStep('handoff-written');

  // Cold-start sidepanel — it drains the handoff on mount.
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp.locator('.ega-user-turn').first()).toBeVisible({ timeout: 15_000 });
  await expect(sp.locator('.ega-answer').first()).toContainText('Welcome', {
    timeout: 10_000,
  });
  await probe.close();
  timeline.markStep('sidepanel-seeded');

  const menu = await openReplyMenu(sp, 'refine');
  const shorter = menu.locator('[data-ega-refine-preset="shorter"]');
  await expect(shorter).toBeVisible({ timeout: 5_000 });
  timeline.markStep('menu-open');

  await shorter.click();
  timeline.markStep('preset-picked');

  // The refine must spawn a variant, not a new pair of turns.
  await expect(sp.locator('[data-ega-variant-nav]')).toBeVisible({ timeout: 10_000 });
  await expect(sp.locator('.ega-user-turn')).toHaveCount(1);
  await expect(sp.locator('[data-ega-reply]')).toHaveCount(1);
  timeline.markStep('variant-spawned');
});
