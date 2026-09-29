/* coverage: integration.settings-runtime-propagation.rules-edit-propagates-to-sidepanel */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  type ExtensionHandle,
} from '../../../helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    backendOrder: ['anthropic', 'openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
    disabledBackends: ['openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
    streaming: false,
    cacheEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('rules patch is reflected in the next translate system prompt', async () => {
  const anth = mockAnthropic(ext.context, { translation: 'ok' });

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.waitForLoadState('domcontentloaded');

  // Append a rule via the settings-bus. Patch shape mirrors the
  // valibot-validated advanced.rules schema.
  await sp.evaluate(async () => {
    await chrome.runtime.sendMessage({
      kind: 'settings:update',
      patch: {
        advanced: {
          rules: [
            {
              id: 'sentinel-rule-1',
              body: 'NEVER_TRANSLATE_SENTINEL_TOKEN',
              category: 'never',
              scope: { tasks: ['translate'] },
              source: 'manual',
              addedAt: new Date().toISOString(),
              enabled: true,
            },
          ],
        },
      },
    });
  });

  // Turn — the rule should appear in the outbound system prompt body.
  await sp.evaluate(() => {
    void chrome.runtime.sendMessage({
      kind: 'translate:start',
      requestId: 'rules-1',
      text: 'hello',
      sourceLang: 'en',
      targetLang: 'es',
      options: { stream: false, explain: false, task: 'translate' },
    });
  });
  await expect
    .poll(
      () => {
        const body = anth.lastRequestBody();
        return body ?? '';
      },
      { timeout: 10_000 },
    )
    .toMatch(/NEVER_TRANSLATE_SENTINEL_TOKEN/);
});
