/* coverage: integration.tooltip-sidepanel-escalation.image-ocr-tooltip-then-sidepanel */
import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  suppressSidePanelOpen,
  mockAnthropic,
  seedSettings,
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
    contextEnabled: false,
    // The default 'sidepanel' surface skips the tooltip, so the Open-in-sidepanel button never mounts.
    imageTranslateSurface: 'tooltip',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Open-in-sidepanel button on an image-OCR tooltip seeds the sidepanel', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Welcome to the group chat' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  // The hook fires image:translate from the content script, so the SW sees a real sender.tab and routes the result back to this tab.
  const requestId = await egaTest<string>(
    page,
    'dispatchImageTranslate',
    `${ext.serverUrl}/arabizi.png`,
  );
  expect(typeof requestId).toBe('string');
  expect((requestId ?? '').length).toBeGreaterThan(0);
  timeline.markStep('image-translate-dispatched');

  await waitForVisibleText(page, '.tooltip .body', 'Welcome', { timeoutMs: 15_000 });
  timeline.markStep('tooltip-mounted');

  // The open-image button renders only when tip.imageUrl is set.
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot ?? document;
          return root.querySelector('[data-ega-escalate="open-image"]') !== null;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
  timeline.markStep('open-affordance-visible');

  await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot ?? document;
    const btn = root.querySelector('[data-ega-escalate="open-image"]') as HTMLButtonElement | null;
    btn?.click();
  });

  // chrome.storage.session is extension-only, so read it from an options page.
  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await expect
    .poll(
      async () =>
        await opts.evaluate(async () => {
          const r = (await chrome.storage.session.get('ega.pendingPopupHandoff')) as Record<
            string,
            unknown
          >;
          const slot = r['ega.pendingPopupHandoff'] as
            Record<string, { sourceText?: string }> | undefined;
          if (!slot) return 0;
          return Object.values(slot).filter((v) => (v.sourceText ?? '').length > 0).length;
        }),
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(1);
  timeline.markStep('handoff-slot-written');

  // On mount, drainPopupHandoffs seeds a user turn from the slot.
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp.locator('.ega-user-turn').first()).toBeVisible({ timeout: 10_000 });
  timeline.markStep('sidepanel-seeded');
});
