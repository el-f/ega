/* coverage: integration.tooltip-sidepanel-escalation.escalation-then-retry */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  suppressSidePanelOpen,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../../helpers';
import { createTimeline, sseOk } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await suppressSidePanelOpen(ext.context, ext.extensionId);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    contextEnabled: false,
    backendOrder: ['anthropic', 'openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
    disabledBackends: ['openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('tooltip Pin seeds text turn; Retry re-dispatches and lands success body', async () => {
  const timeline = createTimeline();
  let calls = 0;

  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    calls += 1;
    if (calls === 1) {
      // 500, not 401: on AUTH the router replaces Retry with "Open settings".
      await route.fulfill({
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: { type: 'server_error', message: 'upstream' } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
      body: sseOk('Recovered after retry.'),
    });
  });

  // The tooltip shares this route, so call 1 fails there too and shows escalate, not Pin.
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('shortcut-pressed');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot ?? document;
          return root.querySelector('[data-ega-escalate="continue"]') !== null;
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
  timeline.markStep('escalate-btn-visible');

  await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot ?? document;
    (root.querySelector('[data-ega-escalate="continue"]') as HTMLButtonElement | null)?.click();
  });

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

  // Reset so the drain's re-dispatch takes the 500 and only Retry succeeds.
  calls = 0;

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp.locator('.ega-user-turn').first()).toBeVisible({ timeout: 10_000 });
  await probe.close();
  timeline.markStep('sidepanel-seeded');

  const retryBtn = sp.locator('.ega-retry-btn', { hasText: /retry/i });
  await expect(retryBtn).toBeVisible({ timeout: 10_000 });
  timeline.markStep('error-state');

  await retryBtn.click();
  timeline.markStep('retry-clicked');

  await expect(sp.locator('.ega-assistant-body').first()).toContainText('Recovered after retry', {
    timeout: 10_000,
  });
  await expect(sp.locator('.ega-retry-btn', { hasText: /retry/i })).toHaveCount(0);
  await expect(sp.locator('.ega-assistant-error')).toHaveCount(0);
  await expect(sp.locator('.ega-user-turn')).toHaveCount(1);
  await expect(sp.locator('.ega-assistant-turn')).toHaveCount(1);
  expect(calls).toBeGreaterThanOrEqual(2);
  timeline.markStep('assertions-complete');
});
