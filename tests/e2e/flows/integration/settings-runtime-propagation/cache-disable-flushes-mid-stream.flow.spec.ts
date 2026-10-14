/* coverage: integration.settings-runtime-propagation.cache-disable-flushes-mid-stream */
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
    cacheEnabled: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('cache disable mid-flight bypasses cache on next attempt', async () => {
  const anth = mockAnthropic(ext.context, { translation: 'Cached then live' });

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.waitForLoadState('domcontentloaded');

  // Turn 1 populates the cache.
  await sp.evaluate(() => {
    void chrome.runtime.sendMessage({
      kind: 'translate:start',
      requestId: 't1',
      text: 'identical text',
      sourceLang: 'en',
      targetLang: 'es',
      options: { stream: false, explain: false, task: 'translate' },
    });
  });
  await expect.poll(() => anth.calls(), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  const callsAfterT1 = anth.calls();

  await sp.evaluate(async () => {
    await chrome.runtime.sendMessage({
      kind: 'settings:update',
      patch: { cacheEnabled: false },
    });
  });

  // Turn 2 sends the same text, so only a disabled cache makes the backend fire again.
  await sp.evaluate(() => {
    void chrome.runtime.sendMessage({
      kind: 'translate:start',
      requestId: 't2',
      text: 'identical text',
      sourceLang: 'en',
      targetLang: 'es',
      options: { stream: false, explain: false, task: 'translate' },
    });
  });
  await expect.poll(() => anth.calls(), { timeout: 10_000 }).toBeGreaterThan(callsAfterT1);
});
