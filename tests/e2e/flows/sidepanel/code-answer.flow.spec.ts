/* coverage: translation.sidepanel.code-answer */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

// The file the owner selected on GitHub's code view and sent to the panel (2026-10-23).
const SOURCE = readFileSync(
  fileURLToPath(new URL('../../fixtures/batch-page.html', import.meta.url)),
  'utf8',
).trim();
// A model that follows the code rule: the markup kept, only the Arabizi lines translated, one fenced block.
const CODE = SOURCE.replace(
  'mar7aba habibi, kifak? shu 3am ta3mel?',
  'Hello my dear, how are you? What are you up to?',
)
  .replace('yalla ma3ak shi 7elow ktir 3njad', 'Come on, got anything nice? Really, seriously')
  .replace('kif 7alak w shu akhbarak al-yom 7abibi', 'How are you and what is new today, dear');
const ANSWER = '```html\n' + CODE + '\n```';
const DIRECTION = 'Arabizi (Levantine) + English → English';

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

/** Sends the file as a Translate message and returns the panel page and the reply. */
async function sendSource(answer: string) {
  mockAnthropic(ext.context, {
    translation: answer,
    confidence: 0.8,
    detectedLangs: [{ id: 'arabizi', detail: 'Levantine' }, { id: 'en' }],
  });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').fill(SOURCE);
  await page.locator('#sp-text').press('Enter');
  return { page, turn: page.locator('[data-ega-reply]').first() };
}

/** ReplyMeta re-fits on a ResizeObserver callback; two frames let it run after a resize. */
async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

test('code sent to the panel comes back as a code block with its tags as text, and the meta line names both languages', async () => {
  const timeline = createTimeline();
  const { page, turn } = await sendSource(ANSWER);
  timeline.markStep('send-clicked');

  const answer = turn.locator('.ega-answer');
  const code = answer.locator('pre code');
  await expect(code).toContainText('<h1>Comment thread fixture</h1>', { timeout: 10_000 });
  timeline.markStep('answer-settled');

  // The markup is text: no element comes from the answer's tags, and no fence marker shows.
  await expect(answer.locator('h1')).toHaveCount(0);
  await expect(answer.locator('p')).toHaveCount(0);
  await expect(answer.locator('#c1')).toHaveCount(0);
  await expect(answer).not.toContainText('```');
  await expect(code).toContainText('<p id="c1">Hello my dear, how are you?');
  expect(await code.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/mono/i);
  expect(await code.evaluate((el) => el.textContent.replace(/\n$/, ''))).toBe(CODE);

  // Both languages on one line, whole, inside the meta row.
  const direction = turn.locator('[data-ega-meta-item="direction"]');
  await expect(direction).toHaveText(DIRECTION);
  await expect(direction).not.toHaveClass(/ega-sr-only/);

  for (const width of [400, 320]) {
    await page.setViewportSize({ width, height: 720 });
    await settleLayout(page);
    const shown = await direction.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const meta = el.closest('[data-ega-reply-meta]')?.getBoundingClientRect();
      return {
        past: r.right - (meta?.right ?? 0),
        lines: Math.round(r.height / Number.parseFloat(getComputedStyle(el).lineHeight)),
        scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(shown.past, `${width}px`).toBeLessThanOrEqual(0.5);
    expect(shown.lines, `${width}px`).toBe(1);
    expect(shown.scroll, `${width}px`).toBeLessThanOrEqual(0);
    await expect(direction).toHaveText(DIRECTION);
  }
  timeline.markStep('code-shown');
});

test('a model that skips the fence still gets no element from the answer tags', async () => {
  const { turn } = await sendSource(CODE);
  const answer = turn.locator('.ega-answer');
  await expect(answer).toContainText('<h1>Comment thread fixture</h1>', { timeout: 10_000 });
  await expect(answer.locator('h1')).toHaveCount(0);
  await expect(answer.locator('#c1')).toHaveCount(0);
  await expect(turn.locator('[data-ega-meta-item="direction"]')).toHaveText(DIRECTION);
});
