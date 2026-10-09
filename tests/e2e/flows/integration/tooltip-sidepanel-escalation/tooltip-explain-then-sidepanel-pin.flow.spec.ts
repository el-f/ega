/* coverage: integration.tooltip-sidepanel-escalation.tooltip-explain-then-sidepanel-pin */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  suppressSidePanelOpen,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../../helpers';
import { createTimeline, waitForVisibleText } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await suppressSidePanelOpen(ext.context, ext.extensionId);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    // Off keeps req.context undefined, so the cache key matches the later sidepanel run.
    contextEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Pin-to-sidepanel button writes a handoff slot consumed by the sidepanel', async () => {
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

  // Pin mounts only when tip.explain is populated — that is why the mock ships it.
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
  timeline.markStep('pin-affordance-visible');

  await page.locator('[data-ega-escalate="pin"]').click();

  // The Pin write is async — wait for it, or drainPopupHandoffs reads an empty map.
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
  timeline.markStep('handoff-slot-written');

  // Keep the probe open until the sidepanel asserts; an SW eviction clears storage.session.
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp.locator('.ega-user-turn').first()).toBeVisible({ timeout: 15_000 });
  await expect(sp.locator('.ega-user-turn').first()).not.toHaveText('');
  await probe.close();
  timeline.markStep('sidepanel-seeded');
});
