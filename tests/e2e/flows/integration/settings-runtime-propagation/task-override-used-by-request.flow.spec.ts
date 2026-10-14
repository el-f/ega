/* coverage: integration.settings-runtime-propagation.task-override-used-by-request */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  sendFromPanel,
  setNextMessage,
  type ExtensionHandle,
} from '../../../helpers';
import { createTimeline } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    backendOrder: ['anthropic', 'openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
    disabledBackends: ['openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
    streaming: false,
    cacheEnabled: false,
    taskOverrides: {
      summarize: { system: 'SUMMARIZE_EDIT_SENTINEL Summarize in one line.' },
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('an edited built-in prompt is the system text the backend receives', async () => {
  const timeline = createTimeline();
  const anth = mockAnthropic(ext.context, { translation: 'short summary' });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await setNextMessage(page, { task: 'summarize' });
  await sendFromPanel(page, 'A long paragraph about nothing in particular.');
  await expect(page.locator('[data-ega-reply]')).toHaveCount(1, { timeout: 10_000 });
  timeline.markStep('summarize-sent');

  await expect
    .poll(() => anth.lastRequestBody() ?? '', { timeout: 10_000 })
    .toContain('SUMMARIZE_EDIT_SENTINEL');
  const body = anth.lastRequestBody() ?? '';
  // The user half was not edited, so the shipped one still frames the text.
  expect(body).toContain('TEXT:');
  // The shipped system half is replaced, not appended to.
  expect(body).not.toContain('Summarize the text in 1-3 sentences');
});
