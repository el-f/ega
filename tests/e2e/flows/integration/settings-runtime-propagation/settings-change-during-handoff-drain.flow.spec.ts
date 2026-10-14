/* coverage: integration.settings-runtime-propagation.settings-change-during-handoff-drain */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  mockOpenAI,
  seedSettings,
  type ExtensionHandle,
} from '../../../helpers';
import { createTimeline } from '../../_harness';

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

test('backend patched between handoff write and cold drain; first turn uses patched backend', async () => {
  const timeline = createTimeline();
  const anth = mockAnthropic(ext.context, { translation: 'Anthropic reply' });
  const oai = mockOpenAI(ext.context, { translation: 'OpenAI reply' });

  // Write the slot straight to storage.session so the test needs no live popup.
  const probe = await ext.context.newPage();
  await probe.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await probe.evaluate(async () => {
    const slot = {
      [`${Date.now()}-1`]: {
        sourceText: 'translate this text',
        sourceLang: 'en',
        targetLang: 'es',
        task: 'translate',
        tone: 'neutral',
        ts: Date.now(),
      },
    };
    await chrome.storage.session.set({ 'ega.pendingPopupHandoff': slot });
  });
  timeline.markStep('handoff-written');

  await probe.evaluate(async () => {
    await chrome.runtime.sendMessage({
      kind: 'settings:update',
      patch: {
        backendOrder: ['openai', 'anthropic', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
        disabledBackends: ['anthropic', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
      },
    });
  });
  timeline.markStep('settings-patched');

  const anthBeforeDrain = anth.calls();
  const oaiBeforeDrain = oai.calls();

  // A cold open drains the slot on mount; the worker reads settings at dispatch, after the patch.
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp.locator('.ega-user-turn').first()).toBeVisible({ timeout: 10_000 });
  timeline.markStep('sidepanel-mounted');

  await expect.poll(() => oai.calls(), { timeout: 10_000 }).toBeGreaterThan(oaiBeforeDrain);
  timeline.markStep('backend-fired');

  expect(anth.calls()).toBe(anthBeforeDrain);

  await expect(sp.locator('.ega-user-turn').first()).toContainText('translate this text');

  await probe.close();
});
