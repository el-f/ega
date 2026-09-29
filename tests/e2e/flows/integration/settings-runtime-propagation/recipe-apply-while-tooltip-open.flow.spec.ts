/* coverage: integration.settings-runtime-propagation.recipe-apply-while-tooltip-open */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../../helpers';

// The router re-reads settings on every attempt (`getSettings` inside `resolveTranslateContext`), so a retry picks up a mid-flight rules patch.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    backendOrder: ['anthropic', 'openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
    disabledBackends: ['openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
    cacheEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('rules patched mid-flight surface in tooltip retry attempt', async () => {
  const anth = mockAnthropic(ext.context, { translation: 'Welcome' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');

  await expect.poll(() => anth.calls(), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  const callsAfterFirst = anth.calls();

  // Patch from an extension page — content-script pages have no `chrome.runtime` in the main world.
  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await opts.evaluate(async () => {
    await chrome.runtime.sendMessage({
      kind: 'settings:update',
      patch: {
        advanced: {
          rules: [
            {
              id: 'recipe-rule-1',
              body: 'RECIPE_APPLIED_SENTINEL',
              category: 'always',
              scope: { tasks: ['translate'] },
              source: 'recipe',
              addedAt: new Date().toISOString(),
              enabled: true,
            },
          ],
        },
      },
    });
  });

  await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot ?? document;
    const retry = root.querySelector('[aria-label="Retry"]') as HTMLButtonElement | null;
    if (retry) {
      retry.click();
    }
  });
  // Success mode renders no Retry button, so re-fire the translate with the shortcut.
  await page.keyboard.press('Control+Shift+L');

  await expect
    .poll(() => anth.lastRequestBody() ?? '', { timeout: 10_000 })
    .toMatch(/RECIPE_APPLIED_SENTINEL/);
  expect(anth.calls()).toBeGreaterThan(callsAfterFirst);
});
