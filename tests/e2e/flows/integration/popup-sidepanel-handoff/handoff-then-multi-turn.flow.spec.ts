/* coverage: integration.popup-sidepanel-handoff.handoff-then-multi-turn */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../../helpers';
import { createTimeline } from '../../_harness';

// Guard: the seeded turn's lastDispatch must not bleed into turn 2's source text.

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

test('handoff seeds turn 1; sending a second message produces turn 2 with fresh content', async () => {
  const timeline = createTimeline();
  let callCount = 0;
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    callCount += 1;
    const translation = callCount === 1 ? 'Bonjour le monde' : 'Gracias amigo';
    const json = JSON.stringify({ translation, confidence: 0.95 });
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
        `data: {"type":"message_start","message":{"id":"m${callCount}","type":"message","role":"assistant","content":[]}}`,
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
        g.chrome.tabs.query = async () => [{ id: 92, url: 'https://example.com/' }];
      }
    }
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await popup.locator('[data-ega-freeform-collapsed]').click();
  await popup.locator('[data-ega-freeform-textarea]').fill('translate hello to french');
  await popup.getByRole('button', { name: /Open in side panel/i }).click();
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

  // A cold-start sidepanel drains the handoff and seeds turn 1.
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp.locator('.ega-user-turn').first()).toContainText('translate hello to french', {
    timeout: 10_000,
  });
  await expect(sp.locator('.ega-answer').first()).toContainText('Bonjour', {
    timeout: 10_000,
  });
  await expect(sp.locator('.ega-user-turn')).toHaveCount(1);
  await expect(sp.locator('[data-ega-reply]')).toHaveCount(1);
  timeline.markStep('turn-1-seeded');

  await sp.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await sp.locator('#sp-text').fill('gracias amigo');
  await sp.locator('#sp-text').press('Enter');
  timeline.markStep('turn-2-send-clicked');

  await expect(sp.locator('.ega-user-turn')).toHaveCount(2, { timeout: 10_000 });
  await expect(sp.locator('[data-ega-reply]')).toHaveCount(2, { timeout: 10_000 });
  await expect(sp.locator('[data-ega-reply]').last()).toContainText('Gracias', {
    timeout: 10_000,
  });
  timeline.markStep('turn-2-rendered');

  await expect(sp.locator('.ega-user-turn').first()).toContainText('translate hello to french');
  await expect(sp.locator('.ega-user-turn').last()).toContainText('gracias amigo');
  expect(callCount).toBeGreaterThanOrEqual(2);
  timeline.markStep('assertions-complete');
});
