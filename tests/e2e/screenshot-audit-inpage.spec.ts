import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  onlyBackends,
  pickAreasAndTranslate,
  resetRoutes,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPaths } from '../../scripts/visual-judge/config';
import { checkDesignRules } from './design-rules';
import type { ShotMeta } from '../../scripts/visual-judge/judge/types';

// The popup and in-page surfaces of the page-popup redesign, each state in light and dark. Run with `pnpm visual:capture`.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { currentDir: CURRENT_DIR, metaDir: META_DIR } = buildPaths(
  path.resolve(__dirname, '..', '..'),
);
const POPUP = { width: 360, height: 640 };
const PAGE = { width: 1000, height: 700 };

let ext: ExtensionHandle;

test.beforeAll(async () => {
  fs.mkdirSync(CURRENT_DIR, { recursive: true });
  fs.mkdirSync(META_DIR, { recursive: true });
  ext = await launchExtension();
});

test.afterEach(async () => {
  for (const page of ext.context.pages().slice(1)) await page.close().catch(() => undefined);
});

test.afterAll(async () => {
  await ext.close();
});

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((t) => {
    document.documentElement.dataset['theme'] = t;
    document.documentElement.style.colorScheme = t;
  }, theme);
  await page.waitForTimeout(150); // wait for the custom-property cascade to repaint (no observable end state)
}

async function snap(page: Page, name: string, meta: Omit<ShotMeta, 'name'>): Promise<void> {
  if (meta.viewport) await page.setViewportSize(meta.viewport);
  await page.waitForTimeout(80); // wait for layout reflow (no observable end state)
  const file = path.join(CURRENT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: meta.surface === 'popup' });
  fs.writeFileSync(
    path.join(META_DIR, `${name}.meta.json`),
    JSON.stringify({ name, ...meta }, null, 2),
  );
  await checkDesignRules(page, name);
}

/** One state, light then dark, from the same page: the two shots differ only in the theme. */
async function both(
  page: Page,
  name: string,
  meta: Omit<ShotMeta, 'name' | 'theme'>,
): Promise<void> {
  await setTheme(page, 'light');
  await snap(page, name, { ...meta, theme: 'light' });
  await setTheme(page, 'dark');
  await snap(page, `${name}-dark`, { ...meta, theme: 'dark' });
  await setTheme(page, 'light');
}

/** The popup as a page, over a stubbed active tab: the URL and the page's answer decide its state. */
async function openPopup(
  context: BrowserContext,
  tab: { url: string; reply?: unknown; reject?: boolean; clipboard?: string },
): Promise<Page> {
  const popup = await context.newPage();
  await popup.addInitScript((t) => {
    const g = globalThis as unknown as {
      chrome: {
        tabs: { query: unknown; sendMessage: unknown };
        permissions: { contains: unknown };
      };
    };
    g.chrome.tabs.query = async () => [{ id: 7, url: t.url, windowId: 1 }];
    g.chrome.tabs.sendMessage = async (_id: number, msg: { kind: string }) => {
      if (t.reject)
        throw new Error('Could not establish connection. Receiving end does not exist.');
      return msg.kind === 'ega:get-selection' ? (t.reply ?? { text: '' }) : { ok: true };
    };
    g.chrome.permissions.contains = async () => true;
    if (t.clipboard !== undefined) {
      Object.defineProperty(navigator, 'clipboard', {
        value: { readText: async () => t.clipboard },
        configurable: true,
      });
    }
    (window as unknown as { close: () => void }).close = () => {};
  }, tab);
  await popup.setViewportSize(POPUP);
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await popup.getByRole('button', { name: 'Translate page' }).waitFor();
  await popup.waitForTimeout(300); // wait for the backend chip's probe to settle (no observable end state)
  return popup;
}

const POPUP_META = { surface: 'popup', viewport: POPUP } as const;

test('Popup — every state of the page-popup redesign', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    ...onlyBackends('anthropic'),
  });
  const site = 'https://example.com/article';

  let p = await openPopup(ext.context, { url: site });
  await both(p, 'popup-default', {
    ...POPUP_META,
    state: 'default',
    expectations: [
      'one filled primary: Translate page',
      'switch row "Ega on example.com" is on',
      'swap hidden while From is Auto-detect',
      'four tools in a one-column list, each one line',
      'a labelled text box with a secondary Translate',
    ],
  });
  await p.keyboard.press('Tab');
  await both(p, 'popup-focus-tools', {
    ...POPUP_META,
    state: 'focus-tools',
    expectations: ['Choose areas carries a 2px accent ring'],
  });
  await p.close();

  for (const [state, heldBack] of [
    ['held-english', { reason: 'english' }],
    ['held-too-short', { reason: 'too-short', minLength: 6 }],
    ['held-mode-never', { reason: 'mode-never' }],
  ] as const) {
    p = await openPopup(ext.context, { url: site, reply: { text: 'hi there', heldBack } });
    await both(p, `popup-${state}`, {
      ...POPUP_META,
      state,
      expectations: [
        'status line names why the bubble stayed hidden',
        'Translate anyway at its end',
      ],
    });
    await p.close();
  }

  p = await openPopup(ext.context, { url: 'chrome://extensions/' });
  await both(p, 'popup-restricted', {
    ...POPUP_META,
    state: 'restricted',
    expectations: [
      'no switch',
      '"Ega can\'t run on this page."',
      'page actions read as unavailable',
    ],
  });
  await p.close();

  p = await openPopup(ext.context, { url: site, reject: true });
  await both(p, 'popup-not-running', {
    ...POPUP_META,
    state: 'not-running',
    expectations: ['"Reload this page to use Ega here." with Reload page'],
  });
  await p.close();

  p = await openPopup(ext.context, { url: site, reply: { text: 'shu 3am ta3mel ya zalameh?' } });
  await both(p, 'popup-text-prefilled', {
    ...POPUP_META,
    state: 'text-prefilled',
    expectations: ['the selection fills the text box, which has focus'],
  });
  await p.close();

  p = await openPopup(ext.context, { url: site, clipboard: '   ' });
  await p.getByRole('button', { name: 'Translate clipboard' }).click();
  await p.getByText('The clipboard is empty. Copy some text first.').waitFor();
  await both(p, 'popup-toast-clipboard-empty', {
    ...POPUP_META,
    state: 'toast-clipboard-empty',
    expectations: ['a bottom-center toast with a close button'],
  });
  await p.close();

  p = await openPopup(ext.context, { url: site });
  await p.evaluate(() => (document.documentElement.style.zoom = '2'));
  await both(p, 'popup-zoom-200', {
    ...POPUP_META,
    state: 'zoom-200',
    expectations: ['nothing cut off at 200% zoom'],
  });
  await p.close();

  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    ...onlyBackends('anthropic'),
    defaultLang: 'es',
    pickerEnabled: false,
    sitePrefs: { 'https://example.com': { disabled: true } },
  });
  p = await openPopup(ext.context, { url: site });
  await both(p, 'popup-site-off', {
    ...POPUP_META,
    state: 'site-off',
    expectations: [
      'switch off; "Ega won\'t translate on this site."',
      'Translate page in the secondary look',
      'swap shows between Spanish and English',
      'Pick element shows "Off in Settings"',
    ],
  });
  await p.close();

  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: '', sitePrefs: {} });
  p = await openPopup(ext.context, { url: site });
  await p.locator('[data-ega-popup-no-backend]').waitFor();
  await both(p, 'popup-no-backend', {
    ...POPUP_META,
    state: 'no-backend',
    expectations: ['the setup card holds the only filled button', 'Translate page steps down'],
  });
  await p.close();
});

async function selectText(page: Page, id: string): Promise<void> {
  await page.evaluate((target) => {
    const el = document.getElementById(target);
    if (!el) throw new Error(`#${target} missing`);
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  }, id);
}

async function bubbleShown(page: Page): Promise<void> {
  await expect.poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0).toBe(1);
  await page.waitForTimeout(200); // wait for the 120 ms pop animation (no observable end state)
}

test('Bubble — label, queue, menu, edges, RTL, first run', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    ...onlyBackends('anthropic'),
    bubbleFirstRunSeen: true,
  });
  const meta = { surface: 'smart-bubble', viewport: PAGE } as const;
  const page = await ext.context.newPage();
  await page.setViewportSize(PAGE);
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);

  await selectText(page, 'c1');
  await bubbleShown(page);
  await both(page, 'bubble-default', {
    ...meta,
    state: 'default',
    expectations: [
      '"Translate to English" beside the mark, a chevron segment',
      '4px under the line',
    ],
  });

  await page.evaluate(() => {
    const b = document
      .getElementById('ega-shadow-host')
      ?.shadowRoot?.querySelector<HTMLElement>('.bubble');
    b?.focus();
  });
  await both(page, 'bubble-focus', { ...meta, state: 'focus', expectations: ['2px accent ring'] });

  await egaTest<boolean>(page, 'shiftClickBubble');
  await selectText(page, 'c2');
  await egaTest<boolean>(page, 'shiftClickBubble');
  await selectText(page, 'c4');
  await bubbleShown(page);
  await both(page, 'bubble-queued', {
    ...meta,
    state: 'queued',
    expectations: ['"Translate 3 to English": the count sits inside the label'],
  });

  await egaTest<boolean>(page, 'clickBubbleMenu');
  await page.locator('#ega-shadow-host').evaluate(async (h) => {
    for (let i = 0; i < 40 && !h.shadowRoot?.querySelector('[role="menu"]'); i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
  });
  await both(page, 'bubble-menu-open', {
    ...meta,
    state: 'menu-open',
    expectations: ['a two-item menu under the bubble: Turn off on this site, Bubble settings'],
  });
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 420, height: 700 });
  await selectText(page, 'c3');
  await page.waitForTimeout(400); // English text: smart mode holds the bubble back (no observable end state)
  await selectText(page, 'c2');
  await bubbleShown(page);
  await both(page, 'bubble-near-right-edge', {
    ...meta,
    viewport: { width: 420, height: 700 },
    state: 'near-right-edge',
    expectations: ['the bubble stays 8px inside the viewport'],
  });
  await page.close();

  const rtl = await ext.context.newPage();
  await rtl.setViewportSize(PAGE);
  await rtl.goto(`${ext.serverUrl}/rtl-page.html`);
  await waitForTestHooks(rtl);
  await selectText(rtl, 'r2');
  await bubbleShown(rtl);
  await both(rtl, 'bubble-rtl', {
    ...meta,
    state: 'rtl',
    expectations: ['Ega chrome stays LTR on the RTL page'],
  });
  await rtl.close();

  await seedSettings(ext.context, ext.extensionId, { bubbleFirstRunSeen: false });
  const first = await ext.context.newPage();
  await first.setViewportSize(PAGE);
  await first.emulateMedia({ reducedMotion: 'no-preference' });
  await first.goto(`${ext.serverUrl}/hostile-page.html`);
  await waitForTestHooks(first);
  await first.evaluate(() => document.body.classList.add('dark'));
  await selectText(first, 'c1');
  await bubbleShown(first);
  await both(first, 'bubble-first-run-dark-page', {
    ...meta,
    state: 'first-run-dark-page',
    expectations: ['the bubble edge reads on a black page', 'the first-run ring shows'],
  });
  await first.close();
});

test('Picker bar — Pick element and Choose areas', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    ...onlyBackends('anthropic'),
    bubbleFirstRunSeen: true,
  });
  await seedSettings(ext.context, ext.extensionId, { pickerEnabled: true });
  const meta = { surface: 'picker', viewport: PAGE } as const;
  const page = await ext.context.newPage();
  await page.setViewportSize(PAGE);
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);
  const sw = ext.context.serviceWorkers()[0];
  if (!sw) throw new Error('no service worker');
  const send = async (kind: string): Promise<void> => {
    await sw.evaluate(async (k) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await chrome.tabs.sendMessage(tab.id, { kind: k });
    }, kind);
  };

  await send('picker:enter');
  await expect.poll(async () => egaTest<boolean>(page, 'pickerIsActive')).toBe(true);
  await both(page, 'picker-pick-default', {
    ...meta,
    state: 'pick-default',
    expectations: ['one bar at the bottom: status, Keys, Cancel'],
  });
  const target = page.locator('p').first();
  await target.hover();
  await both(page, 'picker-pick-hover', {
    ...meta,
    state: 'pick-hover',
    expectations: ['the hovered block has the accent outline'],
  });
  if ((await page.locator('#pw').count()) > 0) {
    await page.locator('#pw').hover();
    await both(page, 'picker-pick-private-field', {
      ...meta,
      state: 'pick-private-field',
      expectations: ['the bar says Ega does not read the field, in the danger color'],
    });
  }
  await page.evaluate(() =>
    document
      .getElementById('ega-shadow-host')
      ?.shadowRoot?.querySelector<HTMLElement>('[data-ega-picker-keys]')
      ?.click(),
  );
  await both(page, 'picker-keys-open', {
    ...meta,
    state: 'keys-open',
    expectations: ['a key list above Keys, text only'],
  });
  await page.keyboard.press('Escape');
  await page.close();

  const areas = await ext.context.newPage();
  await areas.setViewportSize(PAGE);
  await areas.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(areas);
  await send('page:chooseAreas');
  await expect.poll(async () => egaTest<boolean>(areas, 'msIsActive')).toBe(true);
  await both(areas, 'picker-areas-empty', {
    ...meta,
    state: 'areas-empty',
    expectations: ['"Click blocks to choose them"; Translate reads as unavailable'],
  });
  await egaTest<boolean>(areas, 'msSelectById', 'c1');
  await egaTest<boolean>(areas, 'msSelectById', 'c2');
  await both(areas, 'picker-areas-two', {
    ...meta,
    state: 'areas-two',
    expectations: [
      '"2 areas chosen"; order badges on the blocks',
      'Replace text is the checked segment',
    ],
  });
  await areas.mouse.click(3, 3);
  await both(areas, 'picker-areas-refusal', {
    ...meta,
    state: 'areas-refusal',
    expectations: ['the refusal replaces the status, in the danger color; no toast'],
  });
  await areas.setViewportSize({ width: 480, height: 700 });
  await both(areas, 'picker-narrow', {
    ...meta,
    viewport: { width: 480, height: 700 },
    state: 'narrow',
    expectations: ['the status takes the first line; the controls wrap under it'],
  });
  await areas.close();
});

async function sendPageTranslate(kind: string): Promise<void> {
  const sw = ext.context.serviceWorkers()[0];
  if (!sw) throw new Error('no service worker');
  await sw.evaluate(async (k) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { kind: k });
  }, kind);
}

function pillLabel(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      document
        .getElementById('ega-shadow-host')
        ?.shadowRoot?.querySelector('[data-ega-batch-label]')
        ?.textContent.trim() ?? '',
  );
}

test('Page translate — pill, blocks and chips', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    ...onlyBackends('anthropic'),
    pageTranslateMode: 'inplace',
    streaming: true,
    cacheEnabled: false,
  });
  const meta = { surface: 'page-translate', viewport: PAGE } as const;

  // Running: replies wait, so the pill shows progress and the blocks their pending look.
  mockAnthropic(ext.context, {
    translation: 'Hello friend, how are you?',
    detectedLang: 'arabizi',
  });
  // Registered last, so it runs first: replies wait until release, then fall through to the mock.
  let release = (): void => {};
  const held = new Promise<void>((r) => (release = r));
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await held;
    await route.fallback();
  });
  let page = await ext.context.newPage();
  await page.setViewportSize(PAGE);
  await page.goto(`${ext.serverUrl}/long-page.html`);
  await waitForTestHooks(page);
  await sendPageTranslate('page:translateAll');
  await expect.poll(() => pillLabel(page)).toMatch(/^Translating/);
  await both(page, 'page-pill-running', {
    ...meta,
    state: 'pill-running',
    expectations: ['a 2px progress line on top', 'Stop', 'blocks dimmed with one spinner'],
  });
  release();
  await expect.poll(() => pillLabel(page), { timeout: 15_000 }).toMatch(/as you scroll/);
  await both(page, 'page-pill-idle-scroll', {
    ...meta,
    state: 'pill-idle-scroll',
    expectations: ['"N of 60 areas translated. The rest translate as you scroll."'],
  });
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect.poll(() => pillLabel(page)).toMatch(/^Stopped/);
  await both(page, 'page-pill-stopped', {
    ...meta,
    state: 'pill-stopped',
    expectations: ['"Stopped. Translated N of 60 areas."', 'Show original, More, Close bar'],
  });
  await page.getByRole('button', { name: 'More' }).click();
  await both(page, 'page-pill-more-open', {
    ...meta,
    state: 'pill-more-open',
    expectations: ['More holds Remove translation'],
  });
  await page.close();
  await resetRoutes(ext.context);

  // Done, then Show original pressed, on a short page in Show both mode.
  await seedSettings(ext.context, ext.extensionId, { pageTranslateMode: 'bilingual' });
  mockAnthropic(ext.context, {
    translation: 'Hello friend, how are you?',
    detectedLang: 'arabizi',
  });
  page = await ext.context.newPage();
  await page.setViewportSize(PAGE);
  await page.goto(`${ext.serverUrl}/hostile-page.html`);
  await waitForTestHooks(page);
  await sendPageTranslate('page:translateAll');
  await expect.poll(() => pillLabel(page), { timeout: 15_000 }).toMatch(/^Page translated/);
  await both(page, 'page-pill-done', {
    ...meta,
    state: 'pill-done',
    expectations: ['"Page translated to English"', 'translations under each block with a side bar'],
  });
  await page.getByRole('button', { name: 'Show original' }).click();
  await both(page, 'page-pill-original-pressed', {
    ...meta,
    state: 'pill-original-pressed',
    expectations: ['Show original reads as pressed; the page shows its own text'],
  });
  await page.close();
  await resetRoutes(ext.context);

  // Failures: a rejected key on every block, then a server error on some.
  await ext.context.route('https://api.anthropic.com/v1/messages', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
    }),
  );
  page = await ext.context.newPage();
  await page.setViewportSize(PAGE);
  await page.goto(`${ext.serverUrl}/hostile-page.html`);
  await waitForTestHooks(page);
  await sendPageTranslate('page:translateAll');
  await expect.poll(() => pillLabel(page), { timeout: 20_000 }).toMatch(/^Couldn't translate/);
  await expect(page.locator('[data-ega-batch-retry]')).toHaveCount(1);
  await expect(page.locator('[data-ega-tx-error]').first()).toBeVisible();
  expect(
    await page
      .locator('[data-ega-tx-error]')
      .first()
      .evaluate((h) => h.shadowRoot?.querySelector('[data-ega-chip-settings]') !== null),
  ).toBe(true);
  await both(page, 'page-pill-all-fail-settings', {
    ...meta,
    state: 'pill-all-fail-settings',
    expectations: [
      'cause sentence + Open settings first, no raw "401"',
      'red chips on the blocks keep their own font on a hostile page',
    ],
  });
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Show error details' }).click();
  await page.locator('[data-ega-batch-details]').waitFor();
  await both(page, 'page-pill-error-details', {
    ...meta,
    state: 'pill-error-details',
    expectations: ['Error details above the row, monospace, with Copy'],
  });
  await page.evaluate(() => document.body.classList.add('dark'));
  await both(page, 'page-chip-hostile', {
    ...meta,
    state: 'chip-hostile',
    expectations: ['chips read on a black page', 'Open settings is a 24px button'],
  });
  await page.close();
  await resetRoutes(ext.context);

  // Choose areas, Show both, on an RTL page.
  mockAnthropic(ext.context, { translation: 'Hello world, this is the first paragraph.' });
  page = await ext.context.newPage();
  await page.setViewportSize(PAGE);
  await page.goto(`${ext.serverUrl}/rtl-page.html`);
  await waitForTestHooks(page);
  await pickAreasAndTranslate(ext, page, ['h', 'r1']);
  await expect.poll(() => pillLabel(page), { timeout: 15_000 }).toMatch(/^Page translated/);
  await both(page, 'page-blocks-rtl-bilingual', {
    ...meta,
    state: 'blocks-rtl-bilingual',
    expectations: [
      'the side bar sits on the right edge of RTL text',
      'the heading translation is 85% size',
    ],
  });
  await page.setViewportSize({ width: 360, height: 700 });
  await both(page, 'page-pill-narrow', {
    ...meta,
    viewport: { width: 360, height: 700 },
    state: 'pill-narrow',
    expectations: ['the pill fits 360px; buttons wrap under the status'],
  });
  await page.close();
  await resetRoutes(ext.context);
});

test('Inline replace and toasts', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    ...onlyBackends('anthropic'),
    defaultDisplayMode: 'inline',
    shortcut: 'Ctrl+Shift+L',
    bubbleFirstRunSeen: true,
    smartBubbleBannerShown: true,
    cacheEnabled: false,
  });
  const meta = { surface: 'page-translate', viewport: PAGE } as const;
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
  let page = await ext.context.newPage();
  await page.setViewportSize(PAGE);
  await page.goto(`${ext.serverUrl}/inline-replace-page.html`);
  await waitForTestHooks(page);
  await selectText(page, 'target');
  await page.keyboard.press('Control+Shift+L');
  await page
    .locator('.ega-toast')
    .waitFor({ timeout: 10_000 })
    .catch(() => undefined);
  await page.waitForFunction(
    () => !!document.getElementById('ega-shadow-host')?.shadowRoot?.querySelector('.ega-toast'),
  );
  await both(page, 'inline-done-toast', {
    ...meta,
    state: 'inline-done-toast',
    expectations: ['"Replaced with the translation." with Undo and a close button, bottom center'],
  });
  await page.close();
  await resetRoutes(ext.context);

  await ext.context.route('https://api.anthropic.com/v1/messages', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":"upstream exploded"}',
    }),
  );
  page = await ext.context.newPage();
  await page.setViewportSize(PAGE);
  await page.goto(`${ext.serverUrl}/inline-replace-page.html`);
  await waitForTestHooks(page);
  await selectText(page, 'target');
  await page.keyboard.press('Control+Shift+L');
  await page.locator('[data-ega-tx-error]').waitFor({ timeout: 20_000 });
  await both(page, 'inline-error-chip', {
    ...meta,
    state: 'inline-error-chip',
    expectations: ['the original text with a red chip after it; no "500" anywhere'],
  });
  await page.close();
  await resetRoutes(ext.context);

  // Toasts: a site that is off, and a shortcut with nothing selected.
  await seedSettings(ext.context, ext.extensionId, {
    sitePrefs: { [ext.serverUrl]: { disabled: true } },
  });
  page = await ext.context.newPage();
  await page.setViewportSize(PAGE);
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await selectText(page, 'arabizi');
  await page.keyboard.press('Control+Shift+L');
  await page.waitForFunction(
    () => !!document.getElementById('ega-shadow-host')?.shadowRoot?.querySelector('.ega-toast'),
  );
  await both(page, 'toast-site-off', {
    ...meta,
    surface: 'unknown',
    state: 'toast-site-off',
    expectations: ['"Ega is off on 127.0.0.1." with Turn on, warning icon'],
  });
  await page.close();

  await seedSettings(ext.context, ext.extensionId, { sitePrefs: {} });
  page = await ext.context.newPage();
  await page.setViewportSize(PAGE);
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').click();
  await page.keyboard.press('Control+Shift+L');
  await page.waitForFunction(
    () => !!document.getElementById('ega-shadow-host')?.shadowRoot?.querySelector('.ega-toast'),
  );
  await both(page, 'toast-instruction', {
    ...meta,
    surface: 'unknown',
    state: 'toast-instruction',
    expectations: ['"Select some text first, then press the shortcut." stays until dismissed'],
  });
  await page.close();
});
