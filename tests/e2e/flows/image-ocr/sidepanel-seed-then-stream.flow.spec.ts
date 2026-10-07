/* coverage: vision.image-ocr.sidepanel-seed-then-stream */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    imageTranslateSurface: 'sidepanel',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('image:translate seeds a sidepanel turn pair and streams into it', async () => {
  const timeline = createTimeline();

  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    const json = JSON.stringify({ translation: 'Image text streamed', confidence: 0.9 });
    const mid = Math.max(1, Math.floor(json.length / 2));
    const first = JSON.stringify(json.slice(0, mid));
    const second = JSON.stringify(json.slice(mid));
    const body = [
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
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body,
    });
  });

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.locator('#sp-text').waitFor({
    state: 'visible',
    timeout: 5_000,
  }); /* mount-ready: conv-stream only renders once a turn exists */
  timeline.markStep('sidepanel-mounted');

  await sp.evaluate(async (imageUrl) => {
    const requestId = crypto.randomUUID();
    await chrome.runtime.sendMessage({ kind: 'image:translate', requestId, imageUrl });
  }, `${ext.serverUrl}/arabizi.png`);
  timeline.markStep('image-translate-dispatched');

  await expect(sp.locator('.ega-answer').first()).toContainText('Image text streamed', {
    timeout: 10_000,
  });

  // Locks the image-as-artifact contract: dropping imageDataUrl from the seed must fail here.
  const userImg = sp.locator('.ega-user-turn .ega-imgprev img').first();
  await expect(userImg).toBeVisible({ timeout: 5_000 });
  await expect(userImg).toHaveAttribute('src', /arabizi\.png$/);
});
