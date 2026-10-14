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

test('a reply renders its streamed answer, one meta line and one action row', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Hello, friend.', confidence: 0.87 });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#sp-text').fill('marhaba');
  await page.locator('#sp-text').press('Enter');
  timeline.markStep('send-clicked');

  const turn = page.locator('[data-ega-reply]');
  await expect(turn).toHaveCount(1, { timeout: 5_000 });

  await expect(page.locator('.ega-answer').first()).toContainText('Hello, friend.', {
    timeout: 10_000,
  });
  timeline.markStep('body-streamed');

  await expect(page.locator('.ega-cursor')).toHaveCount(0, { timeout: 5_000 });

  // The newest reply keeps its action row in view; hover is how an older reply shows it.
  await turn.hover();
  const actions = turn.locator('.ega-reply-actions');
  await expect(actions).toBeVisible();
  // Confidence is plain text at the end of the one meta line, never a pill; it follows the Settings switch.
  const meta = turn.locator('[data-ega-reply-meta]');
  await expect(meta.locator('[data-ega-meta-item]').last()).toHaveText('87% confident');
  await expect(meta.locator('[data-ega-meta-item="confidence"]')).toHaveCount(1);

  await expect(actions.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Regenerate' })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Refine' })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'More' })).toBeVisible();
  timeline.markStep('meta-rendered');
});
