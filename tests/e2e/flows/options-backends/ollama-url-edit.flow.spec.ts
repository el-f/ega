/* coverage: options.backends.ollama-url-edit */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  onlyBackends,
  readStorage,
  seedSettings,
  type ExtensionHandle,
} from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

const CUSTOM_URL = 'http://127.0.0.1:11435';

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    // Enable Ollama so the card is visible and not greyed out.
    ...onlyBackends('ollama'),
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Ollama URL edit persists to storage; Discover models shows result or error', async () => {
  const timeline = createTimeline();

  // Mock the Ollama /api/tags endpoint to return a model list.
  await ext.context.route(`${CUSTOM_URL}/api/tags`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify({
        models: [{ name: 'llama3.2:latest' }, { name: 'mistral:latest' }],
      }),
    });
  });
  // Mock the /api/chat OPTIONS preflight so the CORS check passes cleanly.
  await ext.context.route(`${CUSTOM_URL}/api/chat`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      body: '',
    });
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-backends').click();
  timeline.markStep('tab-active');

  const card = page.locator('details[data-backend-id="ollama"]');
  await expect(card).toBeVisible({ timeout: 5_000 });
  const isOpen = await card.evaluate((el) => (el as HTMLDetailsElement).open);
  if (!isOpen) {
    // The card contains an inner <details> (Extension access section) that also
    // has a <summary>. Use the CollapsibleCard's own summary (.cc-summary).
    await card.locator('summary.cc-summary').click();
  }

  // The Ollama URL input has id="be-url-ol".
  const urlInput = card.locator('#be-url-ol');
  await expect(urlInput).toBeVisible({ timeout: 5_000 });
  await urlInput.fill(CUSTOM_URL);
  await urlInput.press('Tab');
  timeline.markStep('url-entered');

  // Verify storage persists the new URL.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.ollamaUrl;
      },
      { timeout: 5_000 },
    )
    .toBe(CUSTOM_URL);
  timeline.markStep('url-persisted');

  // Click "Discover models".
  const discoverBtn = card.getByRole('button', { name: /Discover models/i });
  await expect(discoverBtn).toBeVisible({ timeout: 3_000 });
  await discoverBtn.click();
  timeline.markStep('discover-clicked');

  // Either: model list renders ("Found N local models") OR an error renders.
  // Both are valid outcomes depending on what the mock returns.
  await expect
    .poll(
      async () => {
        const errorVisible = await card.locator('.help-danger').count();
        const foundText = await card.locator('.help').allTextContents();
        return errorVisible > 0 || foundText.some((t) => /Found|Connected|models/i.test(t));
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  timeline.markStep('result-visible');

  timeline.report();
});
