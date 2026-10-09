/* coverage: translation.tooltip.diff-on-retranslate */
import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
    defaultTask: 'reword',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('re-run with a new tone replaces the body without a version diff', async () => {
  const timeline = createTimeline();

  // mockAnthropic returns one fixed body; this route varies it per call.
  let calls = 0;
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    calls += 1;
    const translation = calls === 1 ? 'Hello world' : 'Hi there world';
    const json = JSON.stringify({ translation, confidence: 0.94 });
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
  timeline.markStep('first-translate-fired');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          const tip = root?.querySelector('.tooltip .body');
          return tip?.textContent.trim() ?? '';
        }),
      { timeout: 10_000 },
    )
    .toContain('Hello world');
  timeline.markStep('first-body-rendered');
  expect(calls).toBe(1);

  // The first translation has no prior body to compare against, so no spans yet.
  const initialDiffCount = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    return root?.querySelectorAll('[data-ega-diff]').length ?? 0;
  });
  expect(initialDiffCount).toBe(0);

  // Switch tone, not task: reopenTooltip drops the diff when the task changes. The hook dispatches the change as the user.
  expect(await egaTest<boolean>(page, 'setTooltipSelect', 'tone:formal')).toBe(true);
  timeline.markStep('tone-switched');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot;
          const tip = root?.querySelector('.tooltip .body');
          return tip?.textContent.trim() ?? '';
        }),
      { timeout: 10_000 },
    )
    .toContain('Hi there world');
  timeline.markStep('second-body-rendered');
  expect(calls).toBe(2);

  // Span counts stay loose — the LCS may merge next-door edits differently per run.
  const diffCounts = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const dels = root?.querySelectorAll('[data-ega-diff="del"]').length ?? 0;
    const adds = root?.querySelectorAll('[data-ega-diff="add"]').length ?? 0;
    return { dels, adds };
  });
  expect(diffCounts.dels).toBe(0);
  expect(diffCounts.adds).toBe(0);
  timeline.markStep('diff-rendered');
});
