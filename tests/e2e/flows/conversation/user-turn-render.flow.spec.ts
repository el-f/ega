/* coverage: translation.conversation.user-turn-render */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  sendFromPanel,
  setNextMessage,
  type ExtensionHandle,
} from '../../helpers';
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

test('a message renders its text, with a task label only where the task changes', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Welcome.' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await sendFromPanel(page, 'marhaba sadiqi');
  const messages = page.locator('[data-ega-user-turn]');
  await expect(messages).toHaveCount(1, { timeout: 5_000 });
  const first = messages.first();
  await expect(first.locator('.ega-user-text')).toHaveText('marhaba sadiqi');
  // Translate is the default, so a conversation that starts with it names no task.
  await expect(first.locator('.ega-task-label')).toHaveCount(0);
  timeline.markStep('turn-1-rendered');

  // Wait for the reply so the next send starts from idle.
  await expect(page.locator('.ega-answer').first()).toContainText('Welcome.', {
    timeout: 10_000,
  });

  await setNextMessage(page, { task: 'reword' });
  await sendFromPanel(page, 'please be nicer');
  await expect(messages).toHaveCount(2, { timeout: 5_000 });
  const second = messages.nth(1);
  await expect(second.locator('.ega-user-text')).toHaveText('please be nicer');
  await expect(second.locator('.ega-task-label')).toHaveText('Reword');
  timeline.markStep('turn-2-rendered');

  // The same task again names nothing; the label marks changes, not every message.
  await expect(page.locator('.ega-answer').nth(1)).toContainText('Welcome.', {
    timeout: 10_000,
  });
  await sendFromPanel(page, 'and shorter');
  await expect(messages).toHaveCount(3, { timeout: 5_000 });
  await expect(messages.nth(2).locator('.ega-task-label')).toHaveCount(0);

  // The first bubble is untouched by later sends.
  await expect(first.locator('.ega-user-text')).toHaveText('marhaba sadiqi');
  await expect(first.locator('.ega-task-label')).toHaveCount(0);
});
