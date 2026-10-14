import { test, expect } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from './helpers';

// chrome.sidePanel.open needs a user gesture Playwright cannot fake, so tests open the panel page directly.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('side panel renders the translate workspace and runs a translation', async () => {
  mockAnthropic(ext.context, { translation: 'Hello, welcome!' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  // Input textarea is present and stable via its id.
  const ta = page.locator('#sp-text');
  await expect(ta).toBeVisible();

  await ta.fill('sabah el kheir');

  await page.locator('#sp-text').press('Enter');

  // Assistant turn body eventually contains the streamed translation.
  await expect(page.locator('.ega-answer').first()).toContainText('Hello', {
    timeout: 10_000,
  });
});

test('conversation stream updates live when a translation completes', async () => {
  mockAnthropic(ext.context, { translation: 'Hello, welcome!' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  // Initially the empty-state is visible (no turns yet).
  await expect(page.locator('[data-ega-sidepanel-empty]')).toBeVisible();

  await page.locator('#sp-text').fill('sabah el kheir');
  await page.locator('#sp-text').press('Enter');

  await expect(page.locator('.ega-answer').first()).toContainText('Hello', {
    timeout: 10_000,
  });

  // Conversation stream now has one assistant turn.
  await expect(page.locator('[data-ega-reply]')).toHaveCount(1, { timeout: 5_000 });
  await expect(page.locator('.ega-answer').first()).toContainText('Hello');
});

test('two translations produce two assistant turns in the stream', async () => {
  mockAnthropic(ext.context, { translation: 'Hello, welcome!' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  // Translate twice. After each send the textarea is cleared and the
  // input stays at #sp-text for the second fill.
  for (const src of ['sabah el kheir', 'kif 7alak']) {
    await page.locator('#sp-text').fill(src);
    await page.locator('#sp-text').press('Enter');
    await expect(page.locator('.ega-answer').first()).toContainText('Hello', {
      timeout: 10_000,
    });
  }

  // Both translations produced assistant turns in the stream.
  await expect(page.locator('[data-ega-reply]')).toHaveCount(2, { timeout: 5_000 });
});
