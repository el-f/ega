/* coverage: translation.conversation.user-turn-render */
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

test('user turn renders source text + task-kind badge', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Welcome.' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-text').fill('marhaba sadiqi');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  await expect(page.locator('.ega-user-turn')).toHaveCount(1, { timeout: 5_000 });
  const firstUser = page.locator('.ega-user-turn').first();
  await expect(firstUser.locator('.ega-user-text')).toHaveText('marhaba sadiqi');
  await expect(firstUser.locator('.ega-kind-badge')).toHaveText('Translate');
  timeline.markStep('turn-1-rendered');

  // Wait for the assistant turn so the next dispatch starts from idle.
  await expect(page.locator('.ega-assistant-body').first()).toContainText('Welcome.', {
    timeout: 10_000,
  });

  await page.locator('[data-ega-task="reword"]').click();
  await page.locator('#sp-text').fill('please be nicer');
  await page.getByRole('button', { name: /^Reword$/ }).click();
  await expect(page.locator('.ega-user-turn')).toHaveCount(2, { timeout: 5_000 });
  const secondUser = page.locator('.ega-user-turn').nth(1);
  await expect(secondUser.locator('.ega-user-text')).toHaveText('please be nicer');
  // A reword badge names the tone it was sent with, so a later picker change cannot rewrite it.
  await expect(secondUser.locator('.ega-kind-badge')).toHaveText('Reword · Neutral');
  timeline.markStep('turn-2-rendered');

  // First bubble untouched after second send — no cross-contamination.
  await expect(firstUser.locator('.ega-user-text')).toHaveText('marhaba sadiqi');
  await expect(firstUser.locator('.ega-kind-badge')).toHaveText('Translate');
});
