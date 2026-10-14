/* coverage: sidepanel.reply.about-instructions */
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
});

test.afterEach(async () => {
  await ext.close();
});

/** The system prompt of an Anthropic request body, whether sent as a string or as text blocks. */
function systemOf(body: string): string {
  const system = (JSON.parse(body) as { system?: string | { text: string }[] }).system;
  if (system === undefined) return '';
  return typeof system === 'string' ? system : system.map((b) => b.text).join('');
}

test('About this reply shows the instructions that were sent, as plain text', async () => {
  const timeline = createTimeline();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    contextEnabled: false,
    captureResultMeta: true,
  });
  const route = mockAnthropic(ext.context, { translation: 'Hello friend.' });
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sendFromPanel(sp, 'hola amigo');
  const reply = newestReply(sp);
  await expect(reply.locator('.ega-answer')).toContainText('Hello friend.', { timeout: 10_000 });
  timeline.markStep('reply-done');

  const menu = await openReplyMenu(sp, 'more');
  const about = menu.getByRole('menuitemcheckbox', { name: 'About this reply' });
  await expect(about).toHaveAttribute('aria-checked', 'false');
  await about.click();
  const details = reply.locator('[data-ega-inspector]');
  await expect(details).toBeVisible();
  // Opening moves focus to the section heading, so a screen reader starts there.
  const heading = details.locator('[data-ega-inspector-title]');
  await expect(heading).toHaveText('About this reply');
  await expect(heading).toBeFocused();
  timeline.markStep('about-open');

  const disclosure = details.getByRole('button', { name: /^Instructions sent/ });
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  const shown = details.getByLabel('Instructions sent', { exact: true });
  await expect(shown).toBeVisible();

  // What the panel shows is what went out on the wire.
  const sent = systemOf(route.lastRequestBody() ?? '{}');
  expect(sent.length).toBeGreaterThan(0);
  const text = (await shown.textContent()) ?? '';
  expect(sent).toContain(text.trim().slice(0, 200));
  await expect(details.locator('[data-ega-instructions]')).toContainText(/\d[\d,]* characters/);
  timeline.markStep('instructions-shown');

  // Closing returns focus to the More button the section was opened from.
  await details.getByRole('button', { name: 'Close' }).click();
  await expect(details).toHaveCount(0);
  await expect(reply.locator('[data-ega-action="more"]')).toBeFocused();
  timeline.markStep('about-closed');
});

test('with request details off, About says the instructions were not recorded', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    contextEnabled: false,
    captureResultMeta: false,
  });
  mockAnthropic(ext.context, { translation: 'Hello friend.' });
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sendFromPanel(sp, 'hola amigo');
  const reply = newestReply(sp);
  await expect(reply.locator('.ega-answer')).toContainText('Hello friend.', { timeout: 10_000 });

  const menu = await openReplyMenu(sp, 'more');
  await menu.getByRole('menuitemcheckbox', { name: 'About this reply' }).click();
  const details = reply.locator('[data-ega-inspector]');
  await expect(details.locator('[data-ega-instructions]')).toContainText(
    'Not recorded. Turn on Record request details in Settings.',
  );
  await expect(details.getByRole('button', { name: /^Instructions sent/ })).toHaveCount(0);
});
