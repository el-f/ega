/* coverage: integration.settings-runtime-propagation.display-mode-change-live */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../../helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    defaultDisplayMode: 'tooltip',
    backendOrder: ['anthropic', 'openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
    disabledBackends: ['openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('content-script settings cache observes patchSettings(defaultDisplayMode) without reload', async () => {
  mockAnthropic(ext.context, { translation: 'OK' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  // Patch from an extension page — a main-world page has no chrome.runtime.sendMessage.
  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await opts.evaluate(async () => {
    await chrome.runtime.sendMessage({
      kind: 'settings:update',
      patch: { defaultDisplayMode: 'inline' },
    });
  });

  await expect
    .poll(
      async () =>
        await opts.evaluate(async () => {
          const r = (await chrome.storage.local.get('ega.settings')) as Record<string, unknown>;
          const s = r['ega.settings'] as Record<string, unknown> | undefined;
          return s?.['defaultDisplayMode'];
        }),
      { timeout: 5_000 },
    )
    .toBe('inline');

  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');

  // The inline span is the only visible proof the content script saw the patch.
  await expect
    .poll(
      async () =>
        await page.evaluate(() => document.querySelectorAll('[data-ega-replaced]').length),
      { timeout: 5_000 },
    )
    .toBeGreaterThan(0);

  const tooltipMounted = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot ?? null;
    return root?.querySelector('.tooltip') != null;
  });
  expect(tooltipMounted).toBe(false);
});
