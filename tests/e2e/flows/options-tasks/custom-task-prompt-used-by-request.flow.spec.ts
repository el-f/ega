/* coverage: options.tasks.custom-task-prompt-used-by-request */
import { test, expect } from '@playwright/test';
import {
  customTask,
  launchExtension,
  mockAnthropic,
  seedCustomTasks,
  seedSettings,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';
import { PLAIN_CONTRACT } from '../../../../src/shared/prompts';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'test-key' });
  await seedCustomTasks(ext.context, ext.extensionId, [customTask()]);
});

test.afterEach(async () => {
  await ext.close();
});

test('a custom task sends its own prompt plus the plain contract, and the answer renders', async () => {
  const timeline = createTimeline();
  const mock = mockAnthropic(ext.context, { translation: 'Short tweet', confidence: 0.9 });
  const panel = await ext.context.newPage();
  await panel.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await panel.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  const chip = panel.locator('[data-ega-task="c-tweet"]');
  await expect(chip).toBeVisible({ timeout: 5_000 });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-checked', 'true');
  await panel.locator('#sp-text').fill('a long thread about cats');
  await panel.getByRole('button', { name: /^Tweet summary$/ }).click();
  await expect.poll(() => mock.calls(), { timeout: 10_000 }).toBe(1);
  const body = mock.lastRequestBody() ?? '';
  expect(body).toContain('Summarize the text as one short tweet.');
  expect(body).toContain(JSON.stringify(PLAIN_CONTRACT).slice(1, -1));
  timeline.markStep('request');

  await expect(panel.locator('.ega-assistant-turn')).toContainText('Short tweet', {
    timeout: 10_000,
  });
  timeline.markStep('answer');
  timeline.report();
});
