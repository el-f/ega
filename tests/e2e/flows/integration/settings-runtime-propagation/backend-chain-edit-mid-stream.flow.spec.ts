/* coverage: integration.settings-runtime-propagation.backend-chain-edit-mid-stream */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  mockOpenAI,
  seedSettings,
  type ExtensionHandle,
} from '../../../helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    openaiApiKey: 'test-key',
    backendOrder: ['anthropic', 'openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
    disabledBackends: ['gemini', 'ollama', 'native', 'groq', 'deepseek'],
    streaming: false,
    cacheEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('patchSettings reordering backendOrder is observed by next translate', async () => {
  const anth = mockAnthropic(ext.context, { translation: 'A1' });
  const oai = mockOpenAI(ext.context, { translation: 'O1' });

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.waitForLoadState('domcontentloaded');

  // Turn 1 — anthropic should win (head of order, both enabled).
  await sp.evaluate(() => {
    void chrome.runtime.sendMessage({
      kind: 'translate:start',
      requestId: 'r1',
      text: 'hello',
      sourceLang: 'en',
      targetLang: 'es',
      options: { stream: false, explain: false, task: 'translate' },
    });
  });
  await expect.poll(() => anth.calls(), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  const anthAfterT1 = anth.calls();
  const oaiAfterT1 = oai.calls();

  // Put openai at the head; the SW ack confirms the write landed before the next translate.
  await sp.evaluate(async () => {
    await chrome.runtime.sendMessage({
      kind: 'settings:update',
      patch: {
        backendOrder: ['openai', 'anthropic', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
        disabledBackends: ['anthropic', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
      },
    });
  });

  // Turn 2 — unique text so the cache misses and a fresh request goes out.
  await sp.evaluate(() => {
    void chrome.runtime.sendMessage({
      kind: 'translate:start',
      requestId: 'r2',
      text: 'unique-after-patch',
      sourceLang: 'en',
      targetLang: 'es',
      options: { stream: false, explain: false, task: 'translate' },
    });
  });
  await expect.poll(() => oai.calls(), { timeout: 10_000 }).toBeGreaterThan(oaiAfterT1);
  expect(anth.calls()).toBe(anthAfterT1);
});
