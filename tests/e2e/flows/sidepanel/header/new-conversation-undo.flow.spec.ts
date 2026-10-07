/* coverage: sidepanel.header.new-conversation-undo */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  sendFromPanel,
  type ExtensionHandle,
} from '../../../helpers';
import { FOLLOW_FIXTURE_SCRIPT, openExampleTab } from '../../../sidepanel-audit';
import { createTimeline } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    contextEnabled: false,
  });
  // The panel follows the example.com tab beside it, as a real side panel follows its page.
  await ext.context.addInitScript(FOLLOW_FIXTURE_SCRIPT);
  await openExampleTab(ext.context);
});

test.afterEach(async () => {
  await ext.close();
});

test('New starts an empty conversation at once, and Undo opens the old one again', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Hello, friend.' });
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp.locator('[data-ega-header-site]')).toHaveText('example.com', { timeout: 5_000 });

  // New and Search stay out of the header until there is something to leave or search.
  await expect(sp.locator('[data-ega-new-conversation]')).toHaveCount(0);
  await sendFromPanel(sp, 'hola amigo');
  await expect(sp.locator('.ega-answer')).toContainText('Hello, friend.', { timeout: 10_000 });
  timeline.markStep('first-exchange');

  // One click, no confirm: the thread empties and the message box takes focus.
  await sp.locator('[data-ega-new-conversation]').click();
  await expect(sp.locator('[data-ega-user-turn]')).toHaveCount(0);
  await expect(sp.locator('[data-ega-sidepanel-empty]')).toBeVisible();
  await expect(sp.locator('#sp-text')).toBeFocused();
  await expect(sp.locator('[data-ega-new-conversation]')).toHaveCount(0);
  timeline.markStep('new-conversation');

  // The old conversation is still stored: New never deletes anything.
  const stored = await sp.evaluate(async () => {
    const r = await chrome.storage.local.get('ega:conv:index');
    const idx = r['ega:conv:index'] as { threads: { origin: string; title?: string }[] };
    return idx.threads.map((t) => t.title ?? '');
  });
  expect(stored).toContain('hola amigo');

  const toast = sp.locator('[data-sonner-toast]', { hasText: 'Started a new conversation' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(sp.locator('[data-ega-user-turn]')).toHaveCount(1, { timeout: 5_000 });
  await expect(sp.locator('[data-ega-user-turn]')).toContainText('hola amigo');
  await expect(sp.locator('.ega-answer')).toContainText('Hello, friend.');
  await expect(sp.locator('#sp-text')).toBeFocused();
  timeline.markStep('undo-restored');
});
