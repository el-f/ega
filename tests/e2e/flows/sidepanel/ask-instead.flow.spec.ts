/* coverage: translation.sidepanel.ask-instead */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
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

test('a question sent as a translation is one click away from being asked instead', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, {
    translation: TRANSLATION,
    detectedLang: 'arabizi',
    detectedDetail: 'Levantine',
    times: 1,
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sendFromPanel(page, ORIGINAL);
  const first = page.locator('[data-ega-reply]').first();
  await expect(first.locator('.ega-answer')).toContainText(TRANSLATION, { timeout: 10_000 });
  // A translation out of another language has nothing to offer.
  await expect(page.locator('[data-ega-ask-instead]')).toHaveCount(0);
  timeline.markStep('first-reply');

  // The habit: a question typed in Translate. The text is English already, so it comes back unchanged.
  mockAnthropic(ext.context, { translation: QUESTION, detectedLang: 'en', times: 1 });
  await sendFromPanel(page, QUESTION);
  const second = page.locator('[data-ega-reply]').last();
  await expect(second.locator('.ega-answer')).toContainText(QUESTION, { timeout: 10_000 });
  const meta = second.locator('[data-ega-reply-meta]');
  await expect(meta).toContainText('Already in English');
  // The direction would repeat the offer, so it is not shown while the offer is.
  await expect(meta.locator('[data-ega-meta-item="direction"]')).toHaveCount(0);
  const offer = meta.locator('[data-ega-ask-instead]');
  await expect(offer).toHaveText('Ask instead');
  await expect(page.locator('[data-ega-ask-instead]')).toHaveCount(1);
  timeline.markStep('offer-shown');

  // Ask instead: the same text is asked about the reply before it, as a new version of this reply.
  const answer = mockAnthropic(ext.context, {
    rawText: JSON.stringify({ translation: ANSWER }),
    times: 1,
  });
  await offer.click();
  await expect(second.locator('.ega-answer')).toContainText('Levantine because', {
    timeout: 10_000,
  });
  const sent = anthropicPrompt(answer.lastRequestBody());
  expect(sent.user).toContain('The question is about this earlier result');
  expect(sent.user).toContain(`Original text:\n"""\n${ORIGINAL}\n"""`);
  expect(sent.user).toContain(`Result:\n"""\n${TRANSLATION}\n"""`);
  expect(sent.user).toContain(`QUESTION:\n"""\n${QUESTION}\n"""`);
  // The translation stays as the other version, and the offer is gone for good.
  await expect(second.locator('.ega-pager-count')).toHaveText('2/2');
  await expect(page.locator('[data-ega-ask-instead]')).toHaveCount(0);
  await expect(second.locator('[data-ega-meta-item="direction"]')).toHaveText('Answer');
  timeline.markStep('asked-instead');

  // Ask mode follows the new answer, so the next question is about it.
  await expect(page.locator('[data-ega-mode-banner]')).toContainText('Asking about this reply');
  await expect(second).toHaveAttribute('data-ega-ask-target', '');
  await expect(page.locator('#sp-text')).toBeFocused();
});
