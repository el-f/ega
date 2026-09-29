/* coverage: translation.sidepanel.image-turn-no-refine-chips */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { assertStaysStable, createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    imageTranslateSurface: 'sidepanel',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('external image-translate turn has no refine chips and no retry button', async () => {
  const timeline = createTimeline();

  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    const json = JSON.stringify({ translation: 'Image translated.', confidence: 0.9 });
    const mid = Math.max(1, Math.floor(json.length / 2));
    const first = JSON.stringify(json.slice(0, mid));
    const second = JSON.stringify(json.slice(mid));
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: [
        `event: message_start`,
        `data: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","content":[]}}`,
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
      ].join('\n'),
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

  await expect(sp.locator('.ega-assistant-body').first()).toContainText('Image translated', {
    timeout: 10_000,
  });
  timeline.markStep('turn-completed');

  // image-translate has no refine task, so the chips never derive one.
  await assertStaysStable(() => sp.locator('[data-ega-quick-refine]').count(), 0, {
    windowMs: 1_000,
    message: 'quick-refine chips must not mount on image-translate turn',
  });
  timeline.markStep('no-refine-chips');

  // Retry hides because lastDispatch stays null on external image turns.
  await assertStaysStable(() => sp.locator('.ega-retry-btn').count(), 0, {
    windowMs: 500,
    message: 'retry button must be absent for image-translate turn',
  });
  timeline.markStep('no-retry-btn');
});
