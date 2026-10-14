/* coverage: sidepanel.composer.enter-sends */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  type ExtensionHandle,
} from '../../../helpers';
import { assertStaysStable, createTimeline } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    contextEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Enter sends, Shift+Enter adds a line, and an empty box sends nothing', async () => {
  const timeline = createTimeline();
  const mock = mockAnthropic(ext.context, { translation: 'Good morning.\nSee you soon.' });
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  const box = sp.locator('#sp-text');
  await box.waitFor({ state: 'visible', timeout: 5_000 });
  const send = sp.locator('[data-ega-send]');

  // Empty: Send says why it cannot act, and Enter does nothing.
  await expect(send).toHaveAttribute('aria-disabled', 'true');
  await expect(send).toHaveAccessibleDescription('Type a message first');
  await box.focus();
  await sp.keyboard.press('Enter');
  await assertStaysStable(() => mock.calls(), 0, {
    windowMs: 500,
    message: 'Enter on an empty box must send nothing',
  });
  timeline.markStep('empty-enter-ignored');

  await box.pressSequentially('sabah el kheir');
  await sp.keyboard.press('Shift+Enter');
  await box.pressSequentially('ashufak ba3dein');
  await expect(box).toHaveValue('sabah el kheir\nashufak ba3dein');
  expect(mock.calls()).toBe(0);
  await expect(send).not.toHaveAttribute('aria-disabled', 'true');
  timeline.markStep('shift-enter-newline');

  await sp.keyboard.press('Enter');
  await expect(sp.locator('[data-ega-user-turn]')).toHaveCount(1, { timeout: 5_000 });
  await expect(sp.locator('[data-ega-user-turn]')).toContainText('ashufak ba3dein');
  await expect(box).toHaveValue('');
  // Focus stays in the box for the next message.
  await expect(box).toBeFocused();
  await expect(sp.locator('.ega-answer')).toContainText('See you soon.', { timeout: 10_000 });
  expect(mock.calls()).toBe(1);
  timeline.markStep('enter-sent');

  // Ctrl+Enter sends too.
  await box.fill('yalla bye');
  await sp.keyboard.press('Control+Enter');
  await expect(sp.locator('[data-ega-user-turn]')).toHaveCount(2, { timeout: 5_000 });
  timeline.markStep('ctrl-enter-sent');
});
