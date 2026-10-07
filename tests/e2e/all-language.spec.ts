import { test, expect } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from './helpers';

// The side panel is the surface that seeds source/target from the default-language settings.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

async function runSidepanelTranslate(
  extHandle: ExtensionHandle,
  text: string,
): Promise<{ lastRequestBody: () => string | null }> {
  const mock = mockAnthropic(extHandle.context, {
    translation: 'MOCKED TRANSLATION',
    confidence: 0.9,
  });
  const page = await extHandle.context.newPage();
  await page.goto(`chrome-extension://${extHandle.extensionId}/src/sidepanel/index.html`);
  const input = page.locator('#sp-text');
  await input.waitFor({ state: 'visible', timeout: 5_000 });
  await input.fill(text);
  await page.locator('#sp-text').press('Enter');
  // Poll: the router takes a tick to pass through the cache before it calls the mock.
  await expect.poll(() => mock.calls(), { timeout: 10_000 }).toBeGreaterThan(0);
  return mock;
}

test('default target (en) → prompt contains "English"', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
  });
  const mock = await runSidepanelTranslate(ext, 'hola que tal');
  const body = mock.lastRequestBody();
  expect(body).toBeTruthy();
  if (!body) throw new Error('no body');
  expect(body).toContain('English');
  expect(body).not.toContain('French');
  expect(body).not.toContain('Japanese');
});

test('seeded defaultTargetLang=fr → prompt contains "French"', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    defaultTargetLang: 'fr',
  });
  const mock = await runSidepanelTranslate(ext, 'hola que tal');
  const body = mock.lastRequestBody();
  expect(body).toBeTruthy();
  if (!body) throw new Error('no body');
  expect(body).toContain('French');
  expect(body).not.toMatch(/into English/);
});

test('seeded defaultSourceLang=ja → prompt contains "Japanese"', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    defaultLang: 'ja',
  });
  const mock = await runSidepanelTranslate(ext, 'any body here');
  const body = mock.lastRequestBody();
  expect(body).toBeTruthy();
  if (!body) throw new Error('no body');
  expect(body).toContain('Japanese');
});
