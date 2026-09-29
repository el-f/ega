import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from './helpers';

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

function sseBody(translation: string): string {
  const json = JSON.stringify({ translation, confidence: 0.9 });
  const first = JSON.stringify(json.slice(0, Math.max(1, Math.floor(json.length / 2))));
  const second = JSON.stringify(json.slice(Math.max(1, Math.floor(json.length / 2))));
  return [
    `event: message_start`,
    `data: {"type":"message_start","message":{"id":"m1","type":"message","role":"assistant","content":[]}}`,
    ``,
    `event: content_block_delta`,
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${first}}}`,
    ``,
    `event: content_block_delta`,
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${second}}}`,
    ``,
    `event: message_stop`,
    `data: {"type":"message_stop"}`,
    ``,
  ].join('\n');
}

test('image:translate message streams a translation into the side panel', async () => {
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: sseBody('Welcome to the group chat'),
    });
  });

  // Playwright cannot drive the native context menu; dispatching image:translate takes the same router path.
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  // Wait for the sidepanel to finish mounting so its chrome.runtime.onMessage
  // listener is live before we dispatch the messages.
  await sp.locator('#sp-text').waitFor({
    state: 'visible',
    timeout: 5_000,
  }); /* mount-ready: conv-stream only renders once a turn exists */

  // A message the service worker sends to itself is dropped, so send from an extension page.
  await sp.evaluate(async (imageUrl) => {
    const requestId = crypto.randomUUID();
    await chrome.runtime.sendMessage({ kind: 'image:translate', requestId, imageUrl });
  }, `${ext.serverUrl}/arabizi.png`);

  await expect(sp.locator('.ega-assistant-body').first()).toContainText(
    'Welcome to the group chat',
    {
      timeout: 10_000,
    },
  );
});
