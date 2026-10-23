/* coverage: translation.sidepanel.ask-about-reply */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  openReplyMenu,
  seedSettings,
  sendFromPanel,
  type ExtensionHandle,
} from '../../helpers';
import { anthropicPrompt, createTimeline } from '../_harness';

let ext: ExtensionHandle;

const ORIGINAL = 'mar7aba, kifak? shu 3am ta3mel?';
const TRANSLATION = 'Hi, how are you? What are you up to?';
const QUESTION = 'what makes it Levantine?';
const ANSWER = 'It is Levantine because of "kifak" and "shu 3am ta3mel".';

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    // A cached answer would hide the request this flow reads.
    cacheEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Ask on a reply sends that reply with the question, keeps asking, links back and ends with ×', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, {
    translation: TRANSLATION,
    detectedLang: 'arabizi',
    detectedDetail: 'Levantine',
    times: 1,
  });

  const page = await ext.context.newPage();
  // Short enough that two exchanges overflow the thread, so the quote has somewhere to scroll.
  await page.setViewportSize({ width: 400, height: 320 });
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await sendFromPanel(page, ORIGINAL);
  const first = page.locator('[data-ega-reply]').first();
  await expect(first.locator('.ega-answer')).toContainText(TRANSLATION, { timeout: 10_000 });
  await expect(first.locator('[data-ega-meta-item="direction"]')).toHaveText(
    'Arabizi (Levantine) → English',
  );
  timeline.markStep('translated');
  const textX = async (): Promise<number> =>
    (await first.locator('.ega-answer').boundingBox())?.x ?? -1;
  const xBefore = await textX();

  // A draft typed before Ask waits and comes back when the mode ends.
  const field = page.locator('#sp-text');
  await field.fill('a draft');
  await first.locator('[data-ega-action="ask"]').click();
  const banner = page.locator('[data-ega-mode-banner]');
  await expect(banner).toContainText('Asking about this reply');
  await expect(first).toHaveAttribute('data-ega-ask-target', '');
  await expect(first.locator('[data-ega-action="ask"]')).toHaveAttribute('aria-pressed', 'true');
  // The target's bar sits in the gutter, so the text does not move or rewrap.
  expect(await textX()).toBe(xBefore);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('');
  await expect(field).toHaveAttribute('placeholder', 'Ask about this reply');
  await expect(page.locator('[data-ega-mode-said]')).toHaveText(
    `Asking about the reply: ${TRANSLATION}`,
  );
  timeline.markStep('ask-mode-on');

  // Registered later, so it answers the next call; the first mock is spent.
  const answer = mockAnthropic(ext.context, {
    rawText: JSON.stringify({ translation: ANSWER }),
    times: 1,
  });
  await sendFromPanel(page, QUESTION);
  const last = page.locator('[data-ega-reply]').last();
  await expect(last.locator('.ega-answer')).toContainText('Levantine because', {
    timeout: 10_000,
  });

  // The request holds the reply the question is about: its original, its result, its languages, and the question.
  const sent = anthropicPrompt(answer.lastRequestBody());
  expect(sent.user).toContain('The question is about this earlier result');
  expect(sent.user).toContain(`Original text:\n"""\n${ORIGINAL}\n"""`);
  expect(sent.user).toContain(`Result:\n"""\n${TRANSLATION}\n"""`);
  expect(sent.user).toContain('Arabizi (Levantine) → English');
  expect(sent.user).toContain(`QUESTION:\n"""\n${QUESTION}\n"""`);
  // The earlier conversation still goes along.
  expect(sent.before.length).toBeGreaterThanOrEqual(2);
  timeline.markStep('request-checked');

  // The question shows what it is about, and the answer is prose with no languages.
  const question = page.locator('.ega-user-turn').last();
  const quote = question.locator('[data-ega-ask-quote]');
  await expect(quote).toContainText(TRANSLATION);
  await expect(quote).toHaveAccessibleName(`${TRANSLATION}, go to the reply`);
  await expect(question.locator('[data-ega-user-bubble]')).toContainText(QUESTION);
  await expect(last.locator('[data-ega-meta-item="direction"]')).toHaveText('Answer');

  // The composer keeps asking, now about the answer.
  await expect(banner).toContainText('Asking about this reply');
  await expect(last).toHaveAttribute('data-ega-ask-target', '');
  await expect(first).not.toHaveAttribute('data-ega-ask-target');
  await expect(page.locator('[data-ega-mode-said]')).toHaveText('Now asking about the new answer');
  await expect(field).toBeFocused();
  timeline.markStep('still-asking');

  // About this reply names what the answer was about.
  const more = await openReplyMenu(page, 'more', last);
  await more.locator('[data-ega-about]').click();
  await expect(last.locator('[data-ega-asked-about]')).toContainText(TRANSLATION);
  // The answer came back in the Ask format, so About reports no format problem.
  await expect(last.locator('[data-ega-inspector]')).not.toContainText('plain text');
  await last.locator('[data-ega-inspector]').getByRole('button', { name: /close/i }).click();

  // The quote leads back to the first reply, which takes focus and flashes.
  // Under reduced motion every animation is cut to nothing, so the tint must hold without one.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(first).not.toBeInViewport();
  await quote.click();
  await expect(first).toBeInViewport();
  await expect(first).toBeFocused();
  await expect(first).toHaveClass(/flash/);
  // Polls: the global reduced-motion rule still runs a 0.01 ms transition, so the first read can be transparent.
  await expect(first).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  timeline.markStep('quote-revealed');

  // × ends the mode: the composer is back on its task, with the draft.
  await banner.getByRole('button', { name: 'Done asking' }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.locator('[data-ega-ask-target]')).toHaveCount(0);
  await expect(page.locator('[data-ega-mode-chip]')).toContainText('Translate');
  await expect(page.locator('[data-ega-mode-chip]')).toContainText('English');
  await expect(field).toHaveValue('a draft');
  await expect(field).toBeFocused();
  await expect(page.locator('[data-ega-mode-said]')).toContainText('Back to');
  timeline.markStep('done-asking');

  // Delete the first message: the question keeps its quote, now as plain text.
  const original = page.locator('.ega-user-turn').first();
  await original.hover();
  await original.locator('[data-ega-action="more"]').click();
  await page.locator('[data-ega-delete]').click();
  await expect(page.locator('[data-ega-reply]')).toHaveCount(1);
  await expect(page.locator('[data-ega-ask-quote-gone]')).toHaveText('Reply removed');
  await expect(page.locator('[data-ega-ask-quote]')).toHaveCount(0);
  timeline.markStep('quote-gone');
});
