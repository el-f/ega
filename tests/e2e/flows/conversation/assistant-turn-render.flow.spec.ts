/* coverage: translation.conversation.assistant-turn-render */
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

test('assistant turn renders streamed content + meta footer', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Hello, friend.', confidence: 0.87 });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#sp-text').fill('marhaba');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  timeline.markStep('send-clicked');

  const turn = page.locator('.ega-assistant-turn');
  await expect(turn).toHaveCount(1, { timeout: 5_000 });

  await expect(page.locator('.ega-assistant-body').first()).toContainText('Hello, friend.', {
    timeout: 10_000,
  });
  timeline.markStep('body-streamed');

  await expect(page.locator('.ega-cursor')).toHaveCount(0, { timeout: 5_000 });

  // The action row collapses to max-height:0 at rest — hover to reveal it.
  await turn.hover();
  const actions = turn.locator('.ega-assistant-actions');
  await expect(actions).toBeVisible();
  // The pills sit beside the time, so the action row holds only buttons and fits a narrow panel.
  await expect(turn.locator('.ega-assistant-meta .ega-pill', { hasText: '87%' })).toHaveCount(1);

  await expect(actions.getByRole('button', { name: 'Copy reply' })).toBeVisible();
  // Retry left the done footer: it and Regenerate were the same action drawn twice.
  await expect(actions.getByRole('button', { name: 'Regenerate' })).toBeVisible();
  timeline.markStep('meta-rendered');
});
