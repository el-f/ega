import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  mockGemini,
  mockOpenAICompat,
  MOCK_USAGE,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';
import type { BrowserContext } from '@playwright/test';
import {
  CLOUD_PROVIDER_IDS,
  apiKeyField,
  type CloudProviderId,
} from '../../src/shared/provider-ids';
import { backendLabel, getProfile } from '../../src/shared/backends/provider-profiles';

// ollama and native are missing: ollama probe-fails before context.route sees a request, native is not HTTP.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

type MockOpts = Parameters<typeof mockAnthropic>[1];

/** Anthropic and Gemini have their own wires; every other provider speaks chat/completions at its profile's URL. */
function mockFor(id: CloudProviderId): (
  context: BrowserContext,
  opts: MockOpts,
) => {
  calls: () => number;
} {
  if (id === 'anthropic') return mockAnthropic;
  if (id === 'gemini') return mockGemini;
  const profile = getProfile(id);
  if (!profile) throw new Error(`${id} has no chat/completions profile`);
  return (context, opts) => mockOpenAICompat(context, profile.baseUrl, opts);
}

/** OpenRouter reads its public model list for reasoning support; answer it here so no request leaves the box. */
async function routeOpenRouterModelList(context: BrowserContext): Promise<void> {
  await context.route('https://openrouter.ai/api/v1/models', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{ id: 'openai/gpt-4o-mini', supported_parameters: ['temperature', 'max_tokens'] }],
      }),
    }),
  );
}

for (const id of CLOUD_PROVIDER_IDS) {
  test(`${id} backend streams a translation end-to-end`, async () => {
    const expectedPhrase = `${backendLabel(id)} handled this`;
    if (id === 'openrouter') await routeOpenRouterModelList(ext.context);
    const mock = mockFor(id)(ext.context, {
      translation: expectedPhrase,
      confidence: 0.92,
      detectedLang: 'arabizi',
      detectedDetail: 'Levantine',
    });

    await seedSettings(ext.context, ext.extensionId, {
      backendOrder: [id, 'anthropic'],
      [apiKeyField(id)]: 'test-key-abc',
      // DEFAULT_SETTINGS disables every cloud backend, which would drop the seeded one from the order.
      disabledBackends: [],
      streaming: true,
      tooltipClickOutside: true,
      contextEnabled: false,
      captureResultMeta: true,
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
      .toMatchObject({ body: expect.stringContaining(expectedPhrase) });

    expect(mock.calls()).toBeGreaterThanOrEqual(1);

    // The detected fields ride inside the answer text, the usage on the provider's own frames.
    await expect(page.locator('.tooltip .meta .lang:not([data-ega-direction])')).toHaveText(
      'Arabizi — Levantine',
    );
    await page.locator('.tooltip button[aria-label="Show details about this reply"]').click();
    const inspector = page.locator('[data-ega-inspector]');
    const tokens = inspector.locator('.rd-row', { hasText: 'Tokens' });
    await expect(tokens).toContainText(`${MOCK_USAGE.input} in`);
    await expect(tokens).toContainText(`${MOCK_USAGE.output} out`);
  });
}
