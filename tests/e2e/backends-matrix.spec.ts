import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  mockDeepSeek,
  mockGemini,
  mockGroq,
  mockOpenAI,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';
import type { BrowserContext } from '@playwright/test';

// ollama and native are missing: ollama probe-fails before context.route sees a request, native is not HTTP.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

interface Provider {
  id: 'anthropic' | 'openai' | 'gemini' | 'groq' | 'deepseek';
  keyField: 'anthropicApiKey' | 'openaiApiKey' | 'geminiApiKey' | 'groqApiKey' | 'deepseekApiKey';
  setupMock: (
    context: BrowserContext,
    opts: { translation: string; confidence: number },
  ) => { calls: () => number };
  expectedPhrase: string;
}

const PROVIDERS: Provider[] = [
  {
    id: 'anthropic',
    keyField: 'anthropicApiKey',
    setupMock: mockAnthropic,
    expectedPhrase: 'Anthropic handled this',
  },
  {
    id: 'openai',
    keyField: 'openaiApiKey',
    setupMock: mockOpenAI,
    expectedPhrase: 'OpenAI handled this',
  },
  {
    id: 'gemini',
    keyField: 'geminiApiKey',
    setupMock: mockGemini,
    expectedPhrase: 'Gemini handled this',
  },
  {
    id: 'groq',
    keyField: 'groqApiKey',
    setupMock: mockGroq,
    expectedPhrase: 'Groq handled this',
  },
  {
    id: 'deepseek',
    keyField: 'deepseekApiKey',
    setupMock: mockDeepSeek,
    expectedPhrase: 'DeepSeek handled this',
  },
];

for (const p of PROVIDERS) {
  test(`${p.id} backend streams a translation end-to-end`, async () => {
    const mock = p.setupMock(ext.context, {
      translation: p.expectedPhrase,
      confidence: 0.92,
    });

    await seedSettings(ext.context, ext.extensionId, {
      backendOrder: [p.id, 'anthropic'],
      [p.keyField]: 'test-key-abc',
      // DEFAULT_SETTINGS disables every cloud backend, which would drop the seeded one from the order.
      disabledBackends: [],
      streaming: true,
      tooltipClickOutside: true,
      contextEnabled: false,
      shortcut: 'Ctrl+Shift+L',
    });

    const page = await ext.context.newPage();
    await page.goto(`${ext.serverUrl}/selection-page.html`);
    await waitForTestHooks(page);

    await page.locator('body').focus();
    await selectArabiziParagraph(page);
    await page.keyboard.press('Control+Shift+L');

    await expect
      .poll(async () => (await egaTest<number>(page, 'tooltipCount')) ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(0);

    // The poll also returns err + mockCalls, so a timeout report names the step that stalled.
    await expect
      .poll(
        async () => {
          const body = (await egaTest<string>(page, 'tooltipBody')) ?? '';
          const err = (await egaTest<unknown>(page, 'hasError')) ?? false;
          return { body, err, mockCalls: mock.calls() };
        },
        { timeout: 10_000 },
      )
      .toMatchObject({ body: expect.stringContaining(p.expectedPhrase) });

    expect(mock.calls()).toBeGreaterThanOrEqual(1);
  });
}
