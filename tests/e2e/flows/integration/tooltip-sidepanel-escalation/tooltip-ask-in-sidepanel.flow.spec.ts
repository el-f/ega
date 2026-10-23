/* coverage: integration.tooltip-sidepanel-escalation.tooltip-ask-in-sidepanel */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  suppressSidePanelOpen,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../../helpers';
import { anthropicPrompt, createTimeline, waitForVisibleText } from '../../_harness';

let ext: ExtensionHandle;

const ORIGINAL = 'mar7aba, kifak? shu 3am ta3mel?';
const TRANSLATION = 'Hi, how are you? What are you up to?';
const QUESTION = 'what makes it Levantine?';
const ANSWER = 'It is Levantine because of "kifak" and "shu 3am ta3mel".';

test.beforeEach(async () => {
  ext = await launchExtension();
  await suppressSidePanelOpen(ext.context, ext.extensionId);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    contextEnabled: false,
    // A cached answer would hide the request this flow reads.
    cacheEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Ask on a tooltip result opens the panel on the exchange, asking about it, with the detected dialect', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, {
    translation: TRANSLATION,
    detectedLang: 'arabizi',
    detectedDetail: 'Levantine',
    confidence: 0.93,
    times: 1,
  });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  await waitForVisibleText(page, '.tooltip .body', 'Hi, how are you', { timeoutMs: 10_000 });
  timeline.markStep('tooltip-translated');

  // Ask is the second button, after Copy, and it says where it leads.
  const ask = page.locator('[data-ega-tooltip-ask]');
  await expect(ask).toBeVisible();
  await expect(ask).toHaveAccessibleName('Ask about this in the side panel');
  const row = ask.locator('xpath=..');
  await expect(row.getByRole('button').nth(0)).toHaveAccessibleName(/^Copy/);
  await expect(row.getByRole('button').nth(1)).toHaveAccessibleName(
    'Ask about this in the side panel',
  );
  await ask.click();
  timeline.markStep('ask-clicked');

  // The handoff holds the finished result, the Ask flag and what the tooltip detected.
  const probe = await ext.context.newPage();
  await probe.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await expect
    .poll(
      async () =>
        await probe.evaluate(async () => {
          const r = (await chrome.storage.session.get('ega.pendingPopupHandoff')) as Record<
            string,
            unknown
          >;
          const slot = r['ega.pendingPopupHandoff'] as Record<string, unknown> | undefined;
          return Object.values(slot ?? {}).map((e) => {
            const entry = e as Record<string, unknown>;
            // The detection rides in the reply's fields, next to its notes and meta.
            const reply = (entry['reply'] ?? {}) as Record<string, unknown>;
            return [
              entry['ask'],
              entry['response'],
              reply['detectedLang'],
              reply['detectedDetail'],
            ];
          });
        }),
      { timeout: 5_000 },
    )
    .toEqual([[true, TRANSLATION, 'arabizi', 'Levantine']]);
  timeline.markStep('handoff-slot-written');

  // Keep the probe open until the panel asserts; an SW eviction clears storage.session.
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp.locator('.ega-user-turn')).toHaveCount(1, { timeout: 15_000 });
  const reply = sp.locator('[data-ega-reply]');
  await expect(reply.locator('.ega-answer')).toContainText(TRANSLATION);
  // The seeded reply names the languages the tooltip showed.
  await expect(reply.locator('[data-ega-meta-item="direction"]')).toHaveText(
    'Arabizi (Levantine) → English',
  );
  // And the confidence it showed: one result, one meta line on both surfaces.
  await expect(reply.locator('[data-ega-meta-item="confidence"]')).toHaveText('93% confident');

  // Ask mode is on for it, the field has focus, and no "pickers set" toast got in the way.
  await expect(sp.locator('[data-ega-mode-banner]')).toContainText('Asking about this reply');
  await expect(reply).toHaveAttribute('data-ega-ask-target', '');
  await expect(sp.locator('#sp-text')).toBeFocused();
  await expect(sp.locator('[data-ega-mode-said]')).toHaveText(
    `Asking about the reply: ${TRANSLATION}`,
  );
  await expect(sp.locator('[data-sonner-toast]')).toHaveCount(0);
  timeline.markStep('panel-asking');

  // R2-23: type at once, with no click. Keys go to whatever has focus, and the field has it.
  const answer = mockAnthropic(ext.context, {
    rawText: JSON.stringify({ translation: ANSWER }),
    times: 1,
  });
  await sp.keyboard.type(QUESTION);
  await expect(sp.locator('#sp-text')).toHaveValue(QUESTION);
  await sp.keyboard.press('Enter');
  await expect(sp.locator('[data-ega-reply]').last().locator('.ega-answer')).toContainText(
    'Levantine because',
    { timeout: 10_000 },
  );
  timeline.markStep('question-answered');

  // The question carries the dialect the tooltip detected, with the original and the result.
  const sent = anthropicPrompt(answer.lastRequestBody());
  expect(sent.user).toContain('The question is about this earlier result');
  expect(sent.user).toContain('Arabizi (Levantine) → English');
  expect(sent.user).toContain(`Original text:\n"""\n${ORIGINAL}\n"""`);
  expect(sent.user).toContain(`Result:\n"""\n${TRANSLATION}\n"""`);
  expect(sent.user).toContain(`QUESTION:\n"""\n${QUESTION}\n"""`);
  await expect(sp.locator('[data-ega-ask-quote]')).toContainText(TRANSLATION);
  await probe.close();
});
