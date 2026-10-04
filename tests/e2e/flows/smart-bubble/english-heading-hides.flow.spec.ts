/* coverage: translation.smart-bubble.english-heading-hides */
import { test, expect, type Page } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { bubbleMode: 'smart' });
});

test.afterEach(async () => {
  await ext.close();
});

async function select(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    const p = document.createElement('p');
    p.textContent = t;
    document.body.appendChild(p);
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = window.getSelection();
    if (!sel) throw new Error('no window.getSelection()');
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  }, text);
}

const bubbleVisible = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const root = (document.querySelector('#ega-shadow-host') as HTMLElement | null)?.shadowRoot;
    return root?.querySelector('[data-ega-bubble-wrap]') != null;
  });

test('smart bubble hides on English headings once the lexicon loads, and shows on Arabizi', async () => {
  const page = await ext.context.newPage();
  const decisions: string[] = [];
  page.on('console', (m) => {
    if (m.text().startsWith('[ega] bubble shown:')) decisions.push(m.text());
  });
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  // The content script logs each bubble decision with its reason when the page sets this flag.
  await page.evaluate(() => localStorage.setItem('ega-debug', '1'));

  const decided = async (text: string): Promise<string> => {
    await expect
      .poll(() => decisions.find((d) => d.endsWith(` ${text}`)) ?? null, { timeout: 5_000 })
      .not.toBeNull();
    return decisions.find((d) => d.endsWith(` ${text}`)) ?? '';
  };

  // Digit-less Arabizi reaches the English check, so this selection starts the lexicon load.
  await select(page, 'kif halak ya habibi');
  expect(await decided('kif halak ya habibi')).toBe(
    '[ega] bubble shown: true non-english kif halak ya habibi',
  );
  await expect.poll(() => bubbleVisible(page), { timeout: 3_000 }).toBe(true);

  // The top-500 fallback reads both as non-English, so an "english" reason proves the lexicon decided.
  for (const heading of ['Recently', 'HOMEMADE BURGERS']) {
    await select(page, heading);
    expect(await decided(heading)).toBe(`[ega] bubble shown: false english ${heading}`);
    expect(await bubbleVisible(page)).toBe(false);
  }

  await select(page, 'mar7aba kifak');
  expect(await decided('mar7aba kifak')).toMatch(/^\[ega\] bubble shown: true /);
  await expect.poll(() => bubbleVisible(page), { timeout: 3_000 }).toBe(true);
});
