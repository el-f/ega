/* coverage: sidepanel.reply.describe-change */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  newestReply,
  openReplyMenu,
  seedSettings,
  sendFromPanel,
  type ExtensionHandle,
} from '../../../helpers';
import { createTimeline } from '../../_harness';

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

test('Describe a change turns the composer into the change box, and Send adds a version', async () => {
  const timeline = createTimeline();
  const route = mockAnthropic(ext.context, { translation: 'Hello friend.' });
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sendFromPanel(sp, 'hola amigo');
  await expect(sp.locator('.ega-answer')).toContainText('Hello friend.', { timeout: 10_000 });

  // A half-typed next message is kept aside while the change is written.
  const box = sp.locator('#sp-text');
  await box.fill('draft for later');
  timeline.markStep('first-turn-done');

  const menu = await openReplyMenu(sp, 'refine');
  await menu.locator('[data-ega-describe-change]').click();
  const banner = sp.locator('[data-ega-mode-banner]');
  await expect(banner).toHaveText('Changing this reply');
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('');
  await expect(box).toHaveAttribute('placeholder', 'Describe the change');
  // The reply being changed shows its Refine button pressed.
  await expect(newestReply(sp).locator('[data-ega-refine-menu]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  timeline.markStep('refine-mode');

  await box.fill('Use a more poetic style.');
  await box.press('Enter');
  timeline.markStep('change-sent');

  const reply = newestReply(sp);
  await expect(reply.locator('.ega-pager-count')).toHaveText('2/2', { timeout: 10_000 });
  await expect(reply.locator('[data-ega-meta-item="version"]')).toHaveText('Your change', {
    timeout: 10_000,
  });
  await expect(sp.locator('[data-ega-user-turn]')).toHaveCount(1);
  await expect(sp.locator('[data-ega-reply]')).toHaveCount(1);
  // The mode ends with the send and the saved draft comes back.
  await expect(banner).toHaveCount(0);
  await expect(box).toHaveValue('draft for later');
  await expect
    .poll(() => route.lastRequestBody(), { timeout: 5_000 })
    .toMatch(/Use a more poetic style\./);
  timeline.markStep('version-added');
});

test('Esc leaves the change box without sending and restores the draft', async () => {
  const route = mockAnthropic(ext.context, { translation: 'Hello friend.' });
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sendFromPanel(sp, 'hola amigo');
  await expect(sp.locator('.ega-answer')).toContainText('Hello friend.', { timeout: 10_000 });
  const box = sp.locator('#sp-text');
  await box.fill('draft for later');

  const menu = await openReplyMenu(sp, 'refine');
  await menu.locator('[data-ega-describe-change]').click();
  await expect(sp.locator('[data-ega-mode-banner]')).toBeVisible();
  await box.fill('half a change');
  await sp.keyboard.press('Escape');

  await expect(sp.locator('[data-ega-mode-banner]')).toHaveCount(0);
  await expect(sp.locator('[data-ega-mode-chip]')).toBeVisible();
  await expect(box).toHaveValue('draft for later');
  await expect(box).toBeFocused();
  expect(route.calls()).toBe(1);
});
