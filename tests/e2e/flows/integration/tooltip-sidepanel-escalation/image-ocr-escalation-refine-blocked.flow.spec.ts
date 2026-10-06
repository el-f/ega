/* coverage: integration.tooltip-sidepanel-escalation.image-ocr-escalation-refine-blocked */
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
import { createTimeline, waitForVisibleText, assertStaysStable } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await suppressSidePanelOpen(ext.context, ext.extensionId);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    contextEnabled: false,
    imageTranslateSurface: 'tooltip',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('image OCR sidepanel seed shows its image and Regenerate, but no refine chips', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Welcome to the group chat' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  // Go through the test hook so the SW sees `sender.tab` and answers with a tooltip.
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
    (root.querySelector('[data-ega-escalate="open-image"]') as HTMLButtonElement | null)?.click();
  });

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
  timeline.markStep('handoff-written');

  // Mounting the sidepanel drains the image handoff and seeds an image turn.
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp.locator('.ega-user-turn').first()).toBeVisible({ timeout: 10_000 });
  await expect(sp.locator('.ega-assistant-body').first()).toContainText('Welcome', {
    timeout: 10_000,
  });
  await opts.close();
  timeline.markStep('sidepanel-seeded');

  await assertStaysStable(async () => await sp.locator('[data-ega-refine-toggle]').count(), 0, {
    windowMs: 1_000,
    message: 'the Refine button must not appear on an image turn',
  });
  timeline.markStep('chips-absent');

  await expect(sp.locator('[data-ega-regenerate]')).toBeVisible();
  await expect(sp.locator('.ega-imgprev img')).toHaveJSProperty('complete', true);
  expect(
    await sp.locator('.ega-imgprev img').evaluate((img) => (img as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  timeline.markStep('regenerate-and-thumbnail');
});
