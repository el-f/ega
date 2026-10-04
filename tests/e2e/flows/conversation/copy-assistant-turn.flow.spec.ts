/* coverage: translation.conversation.copy-assistant-turn */
import { test, expect } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await ext.context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('copy button on assistant turn writes body to clipboard', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Welcome, friend.' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#sp-text').fill('marhaba');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  timeline.markStep('send-clicked');

  await expect(page.locator('.ega-assistant-body').first()).toContainText('Welcome, friend.', {
    timeout: 10_000,
  });
  // The action row sits at max-height:0 until hover or focus-within.
  await page.locator('.ega-assistant-turn').first().hover();
  const actions = page.locator('.ega-assistant-actions').first();
  await expect(actions).toBeVisible();
  timeline.markStep('done-state');

  const copyBtn = actions.getByRole('button', { name: 'Copy reply' });
  await expect(copyBtn).toBeVisible();
  await copyBtn.click();
  timeline.markStep('copy-clicked');

  await expect(actions.getByRole('button', { name: 'Copied' })).toBeVisible({ timeout: 2_000 });

  // Headless Chromium allows a clipboard read only on a focused page.
  await page.locator('body').focus();
  const clip = await page.evaluate(async () => navigator.clipboard.readText());
  expect(clip).toBe('Welcome, friend.');
});
