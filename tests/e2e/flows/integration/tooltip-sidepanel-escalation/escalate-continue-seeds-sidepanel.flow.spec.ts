/* coverage: integration.tooltip-sidepanel-escalation.escalate-continue-seeds-sidepanel */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  suppressSidePanelOpen,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../../helpers';
import { createTimeline } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await suppressSidePanelOpen(ext.context, ext.extensionId);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    backendOrder: ['anthropic', 'openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
    disabledBackends: ['openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
    cacheEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Continue-in-sidepanel seeds source text as fresh user turn that then translates', async () => {
  const timeline = createTimeline();

  let calls = 0;
  // Call 1 is the tooltip translate and must fail; call 2 is the sidepanel drain.
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: { type: 'server_error', message: 'upstream' } }),
      });
      return;
    }
    const json = JSON.stringify({ translation: 'Seeded via continue', confidence: 0.9 });
    const mid = Math.max(1, Math.floor(json.length / 2));
    const first = JSON.stringify(json.slice(0, mid));
    const second = JSON.stringify(json.slice(mid));
    const body = [
      `event: message_start`,
      `data: {"type":"message_start","message":{"id":"m1","type":"message","role":"assistant","content":[]}}`,
      ``,
      `event: content_block_start`,
      `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
      ``,
      `event: content_block_delta`,
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${first}}}`,
      ``,
      `event: content_block_delta`,
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${second}}}`,
      ``,
      `event: content_block_stop`,
      `data: {"type":"content_block_stop","index":0}`,
      ``,
      `event: message_stop`,
      `data: {"type":"message_stop"}`,
      ``,
    ].join('\n');
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
      body,
    });
  });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('translate-triggered');

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
  expect(calls).toBe(1);

  await page.locator('[data-ega-escalate="continue"]').click();
  timeline.markStep('escalate-clicked');

  // storage.session is only readable from an extension page, so open one.
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
          if (!slot) return false;
          // No `response` field means the sidepanel sends a fresh turn instead of seeding one.
          const entries = Object.values(slot) as Array<Record<string, unknown>>;
          return entries.length > 0 && entries.every((e) => e['response'] === undefined);
        }),
      { timeout: 5_000 },
    )
    .toBe(true);
  timeline.markStep('handoff-no-response-confirmed');

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await expect(sp.locator('.ega-user-turn').first()).toBeVisible({ timeout: 10_000 });
  timeline.markStep('user-turn-visible');

  // Assistant text proves the drain made a real request instead of replaying a seeded turn.
  await expect(sp.locator('.ega-answer').first()).toContainText('Seeded via continue', {
    timeout: 15_000,
  });
  timeline.markStep('assistant-turn-visible');

  await expect(sp.locator('.ega-user-turn')).toHaveCount(1);
  await expect(sp.locator('[data-ega-reply]')).toHaveCount(1);

  expect(calls).toBeGreaterThanOrEqual(2);

  await probe.close();
});
