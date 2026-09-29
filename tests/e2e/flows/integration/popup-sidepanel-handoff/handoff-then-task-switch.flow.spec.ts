/* coverage: integration.popup-sidepanel-handoff.handoff-then-task-switch */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../../helpers';
import { createTimeline } from '../../_harness';

// Reword, not explain: explain shares the translate template, so it gives no wire-payload signal.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('handoff seeds translate turn 1; switching to reword routes turn 2 with reword template', async () => {
  const timeline = createTimeline();
  const bodies: string[] = [];
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    bodies.push(route.request().postData() ?? '');
    const json = JSON.stringify({ translation: 'OK', confidence: 1 });
    const mid = Math.max(1, Math.floor(json.length / 2));
    const first = JSON.stringify(json.slice(0, mid));
    const second = JSON.stringify(json.slice(mid));
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
      body: [
        `event: message_start`,
        `data: {"type":"message_start","message":{"id":"m${bodies.length}","type":"message","role":"assistant","content":[]}}`,
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
      ].join('\n'),
    });
  });

  const popup = await ext.context.newPage();
  await popup.addInitScript(() => {
    const g = globalThis as unknown as {
      chrome?: {
        sidePanel?: { open: (opts: { tabId: number }) => Promise<void> };
        tabs?: { query: (q: unknown) => Promise<Array<{ id: number; url: string }>> };
      };
    };
    if (g.chrome) {
      g.chrome.sidePanel = { open: async () => {} };
      if (g.chrome.tabs) {
        g.chrome.tabs.query = async () => [{ id: 93, url: 'https://example.com/' }];
      }
    }
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await popup.locator('[data-ega-freeform-collapsed]').click();
  await popup.locator('[data-ega-freeform-textarea]').fill('translate this text please');
  await popup.getByRole('button', { name: /Send to panel/i }).click();
  timeline.markStep('send-clicked');

  await expect
    .poll(
      async () =>
        await popup.evaluate(
          async () =>
            await new Promise<number>((resolve) =>
              chrome.storage.session.get('ega.pendingPopupHandoff', (out) => {
                const m = (out as Record<string, unknown>)['ega.pendingPopupHandoff'];
                resolve(m ? Object.keys(m).length : 0);
              }),
            ),
        ),
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(1);
  await popup.close();

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp.locator('.ega-user-turn').first()).toContainText('translate this text please', {
    timeout: 10_000,
  });
  await expect(sp.locator('.ega-assistant-turn')).toHaveCount(1, { timeout: 10_000 });
  timeline.markStep('turn-1-seeded');

  await sp.locator('[data-ega-task="reword"]').click();
  await expect(sp.getByRole('button', { name: /^Reword$/ })).toBeVisible();
  timeline.markStep('task-switched');

  await sp.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await sp.locator('#sp-text').fill('what does this mean');
  await sp.getByRole('button', { name: /^Reword$/ }).click();
  await expect(sp.locator('.ega-assistant-turn')).toHaveCount(2, { timeout: 10_000 });
  timeline.markStep('turn-2-done');

  // "Rewrite the text" comes from buildTaskTemplate('reword').
  expect(bodies.length).toBeGreaterThanOrEqual(2);
  expect(bodies[0] ?? '').not.toMatch(/Rewrite the text/i);
  expect(bodies[1] ?? '').toMatch(/Rewrite the text/i);
  timeline.markStep('wire-payload-asserted');
});
