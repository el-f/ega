/* coverage: integration.tooltip-sidepanel-escalation.tooltip-escalation-preserves-lang */
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
    defaultLang: 'arabizi',
    defaultTargetLang: 'en',
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

test('tooltip escalation preserves source + target lang pair into handoff', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');

  // The Continue button mounts inside the content-script shadow host.
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

  await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot ?? document;
    (root.querySelector('[data-ega-escalate="continue"]') as HTMLButtonElement | null)?.click();
  });

  // storage.session is extension-only, so read the handoff slot from an extension page.
  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  const langs = await opts.evaluate(async () => {
    const r = (await chrome.storage.session.get('ega.pendingPopupHandoff')) as Record<
      string,
      unknown
    >;
    const slot = r['ega.pendingPopupHandoff'] as Record<string, unknown> | undefined;
    if (!slot) return null;
    const first = Object.values(slot)[0] as
      { sourceLang?: string; targetLang?: string } | undefined;
    return first ? { source: first.sourceLang, target: first.targetLang } : null;
  });
  expect(langs).not.toBeNull();
  expect(langs?.target).toBe('en');
  // Source should be the detected/resolved lang ('arabizi' or 'auto').
  expect(typeof langs?.source).toBe('string');
  expect((langs?.source ?? '').length).toBeGreaterThan(0);
});
