/* coverage: translation.tooltip.code-answer */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

// The Translate prompt asks for code or markup back as one fenced block; the tooltip body is plain text.

const CODE = '<h1>Comment thread fixture</h1>\n  <p id="c1">Hello my friend, how are you?</p>';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await ext.context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('a fenced code answer shows as code, names both languages, and copies as code', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, {
    translation: '```html\n' + CODE + '\n```',
    confidence: 0.8,
    detectedLang: 'arabizi',
    detectedLangs: [{ id: 'arabizi', detail: 'Levantine' }, { id: 'en' }],
  });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('translate-fired');

  const body = page.locator('.tooltip .body.code');
  await expect(body).toBeVisible();
  timeline.markStep('code-visible');
  const shown = await body.evaluate((el) => {
    const style = getComputedStyle(el);
    return { text: el.textContent, font: style.fontFamily, whiteSpace: style.whiteSpace };
  });
  expect(shown.text).toBe(CODE);
  expect(shown.font).toMatch(/monospace/);
  expect(shown.whiteSpace).toBe('pre-wrap');
  await expect(page.locator('.tooltip')).not.toContainText('```');
  await expect(page.locator('.tooltip [data-ega-meta-item="direction"]')).toHaveText(
    'Arabizi (Levantine) + English → English',
  );

  await page.locator('.tooltip button[aria-label="Copy translation"]').click();
  // A headless clipboard read needs a focused page; the Windows clipboard hands back CRLF line ends.
  await page.locator('body').focus();
  const clip = await page.evaluate(async () => navigator.clipboard.readText());
  expect(clip.replace(/\r\n/g, '\n')).toBe(CODE);
  timeline.markStep('copied');
});

test('a prose answer with a fence in it stays plain text', async () => {
  const answer = 'The page title:\n```html\n<h1>Comment thread fixture</h1>\n```';
  mockAnthropic(ext.context, { translation: answer, confidence: 0.8 });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');

  const body = page.locator('.tooltip .body');
  await expect(body).toBeVisible();
  await expect.poll(() => body.evaluate((el) => el.textContent)).toBe(answer);
  await expect(page.locator('.tooltip .body.code')).toHaveCount(0);
});
