/* coverage: translation.sidepanel.input-send */
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

test('sending input appends a user turn + an assistant turn', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Welcome.' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await expect(page.locator('[data-ega-empty-state]')).toBeVisible();
  timeline.markStep('empty-state-visible');

  await page.locator('#sp-text').fill('marhaba sadiqi');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  timeline.markStep('send-clicked');

  await expect(page.locator('.ega-user-turn')).toHaveCount(1, { timeout: 5_000 });
  await expect(page.locator('.ega-user-turn')).toContainText('marhaba sadiqi');

  await expect(page.locator('.ega-assistant-turn')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('.ega-assistant-body').first()).toContainText('Welcome', {
    timeout: 10_000,
  });
  timeline.markStep('both-turns-rendered');

  await expect(page.locator('#sp-text')).toHaveValue('');
});
