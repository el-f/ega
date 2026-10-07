/* coverage: translation.sidepanel.refine-on-explain-turn */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  openReplyMenu,
  seedSettings,
  sendFromPanel,
  setNextMessage,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    contextEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('explain turn done → chips mount → [Shorter] → variant with explain on wire', async () => {
  const timeline = createTimeline();

  const bodies: string[] = [];
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    bodies.push(route.request().postData() ?? '');
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
      body: [
        `event: message_start`,
        `data: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","content":[]}}`,
        ``,
        `event: content_block_start`,
        `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
        ``,
        `event: content_block_delta`,
        `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"{\\"translation\\":\\"Explained.\\",\\"confidence\\":1}"}}`,
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

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await setNextMessage(page, { task: 'explain' });
  await expect(page.locator('[data-ega-mode-chip]')).toHaveText('Explain → English');
  timeline.markStep('task-set-explain');

  await sendFromPanel(page, 'what does amor mean');
  await expect(page.locator('.ega-answer').first()).toContainText('Explained', {
    timeout: 10_000,
  });
  timeline.markStep('explain-turn-done');

  const menu = await openReplyMenu(page, 'refine');
  const shorter = menu.locator('[data-ega-refine-preset="shorter"]');
  await expect(shorter).toBeVisible({ timeout: 5_000 });
  timeline.markStep('menu-open');

  await shorter.click();
  timeline.markStep('preset-picked');

  await expect(page.locator('[data-ega-variant-nav]')).toBeVisible({ timeout: 10_000 });
  timeline.markStep('variant-spawned');

  // bodies[1] is the refine call; the explain system prompt proves it took the explain path.
  await expect.poll(() => bodies.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
  expect(bodies[1]).toMatch(/Populate.*explain/);
  timeline.markStep('explain-prompt-on-wire');
});
