/* coverage: translation.sidepanel.stream-tokens */
import { test, expect } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('assistant turn streams tokens visibly with a loading cursor', async () => {
  const timeline = createTimeline();
  // The 600ms delay leaves room to assert the loading state before the body fills.
  mockAnthropic(ext.context, { translation: 'Hello, friend.', delayMs: 600 });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#sp-text').fill('hola');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  timeline.markStep('send-clicked');

  // Without the skeleton the empty bubble paints as a tiny box and looks broken.
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(1, { timeout: 5_000 });
  await expect(page.locator('.ega-stream-skeleton').first()).toBeVisible({ timeout: 5_000 });
  timeline.markStep('skeleton-visible');

  await expect(page.locator('.ega-assistant-body').first()).toContainText('Hello', {
    timeout: 10_000,
  });
  timeline.markStep('body-streamed');

  await expect(page.locator('.ega-cursor')).toHaveCount(0, { timeout: 5_000 });
  await expect(page.locator('.ega-stream-skeleton')).toHaveCount(0);
  // The action row collapses to max-height:0 at rest, so hover to reveal it.
  await page.locator('.ega-assistant-turn').first().hover();
  await expect(page.locator('.ega-assistant-actions').first()).toBeVisible();
  timeline.markStep('done-state');
});
