/* coverage: integration.tooltip-sidepanel-escalation.retry-escalates-to-sidepanel */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  suppressSidePanelOpen,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../../helpers';

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
  });
  await ext.context.route('https://api.anthropic.com/v1/messages', (route) =>
    route.fulfill({ status: 500, body: '{"error":{"message":"upstream"}}' }),
  );
});

test.afterEach(async () => {
  await ext.close();
});

test('Continue-in-sidepanel button hands the source text into pendingPopupHandoff', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');

  // The Continue-in-sidepanel button mounts inside the content-script shadow host.
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot ?? document;
          return root.querySelector('[data-ega-escalate="continue"]') !== null;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);

  await page.locator('[data-ega-escalate="continue"]').click();

  // storage.session is extension-only, so read the handoff slot from an extension page.
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
          const slot = r['ega.pendingPopupHandoff'] as Record<string, unknown> | undefined;
          if (!slot) return 0;
          return Object.keys(slot).length;
        }),
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(1);
});
