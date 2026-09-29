/* coverage: integration.settings-runtime-propagation.task-temp-override-applied-next-attempt */
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

test('taskTemperatures patch applies to the next translate request body', async () => {
  const anth = mockAnthropic(ext.context, { translation: 'ok' });

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.waitForLoadState('domcontentloaded');

  // Turn 1 — default temperature.
  await sp.evaluate(() => {
    void chrome.runtime.sendMessage({
      kind: 'translate:start',
      requestId: 'tt1',
      text: 'first',
      sourceLang: 'en',
      targetLang: 'es',
      options: { stream: false, explain: false, task: 'translate' },
    });
  });
  await expect.poll(() => anth.calls(), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  const body1 = anth.lastRequestBody() ?? '';
  expect(body1.length).toBeGreaterThan(0);
  const parsed1 = JSON.parse(body1) as { temperature?: number };
  const initialTemp = parsed1.temperature ?? 0;

  // Patch — push temperature for the translate task to 0.9.
  await sp.evaluate(async () => {
    await chrome.runtime.sendMessage({
      kind: 'settings:update',
      patch: { taskTemperatures: { translate: 0.9 } },
    });
  });

  // Turn 2 — new temperature should be in the outbound body.
  await sp.evaluate(() => {
    void chrome.runtime.sendMessage({
      kind: 'translate:start',
      requestId: 'tt2',
      text: 'second',
      sourceLang: 'en',
      targetLang: 'es',
      options: { stream: false, explain: false, task: 'translate' },
    });
  });
  await expect
    .poll(
      () => {
        const body = anth.lastRequestBody();
        if (!body) return -1;
        try {
          const j = JSON.parse(body) as { temperature?: number };
          return j.temperature ?? -1;
        } catch {
          return -1;
        }
      },
      { timeout: 10_000 },
    )
    .toBe(0.9);
  expect(0.9).not.toBe(initialTemp);
});
