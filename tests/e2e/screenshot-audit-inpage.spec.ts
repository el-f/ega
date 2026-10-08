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
/** Chrome's toolbar popup is at most 800x600; page zoom widens it. */
const POPUP_CAP = { width: 800, height: 600 };
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
  let shot = meta;
  if (meta.surface === 'popup') {
    // Chrome sizes the toolbar popup to its body, up to 800x600; a taller page would hide what overflows or what a toast covers.
    const size = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: Math.ceil(document.body.getBoundingClientRect().height),
    }));
    const viewport = {
      width: Math.min(POPUP_CAP.width, Math.max(POPUP.width, size.width)),
      height: Math.min(POPUP_CAP.height, size.height),
    };
    await page.setViewportSize(viewport);
    await page.waitForTimeout(80); // wait for layout reflow (no observable end state)
    shot = { ...meta, viewport };
  }
  const file = path.join(CURRENT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  fs.writeFileSync(
    path.join(META_DIR, `${name}.meta.json`),
    JSON.stringify({ name, ...shot }, null, 2),
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
  // No url: the tab Chrome gives an extension with no "tabs" permission on a page it cannot run on.
  tab: { url?: string; reply?: unknown; reject?: boolean; clipboard?: string },
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
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';

/** A fixture page with the test hooks up. */
async function openPage(
  fixture: string,
  viewport: { width: number; height: number } = PAGE,
): Promise<Page> {
  const page = await ext.context.newPage();
  await page.setViewportSize(viewport);
  await page.goto(`${ext.serverUrl}/${fixture}`);
  await waitForTestHooks(page);
  return page;
}

async function waitToast(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !!document.getElementById('ega-shadow-host')?.shadowRoot?.querySelector('.ega-toast'),
    undefined,
    { timeout: 10_000 },
  );
}

/** Writes one storage key through an extension page; only extension contexts have chrome.storage. */
async function writeStorage(key: string, value: unknown): Promise<void> {
  const page = await ext.context.newPage();
  try {
    await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    await page.evaluate(
      async ({ k, v }) => {
        await chrome.storage.local.set({ [k]: v });
      },
      { k: key, v: value },
    );
  } finally {
    await page.close();
  }
}

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

  // Each held-back reason with a selection that would really earn it.
  for (const [state, text, heldBack] of [
    ['held-english', 'hi there', { reason: 'english' }],
    ['held-too-short', 'hola', { reason: 'too-short', minLength: 6 }],
    ['held-mode-never', 'shu 3am ta3mel', { reason: 'mode-never' }],
  ] as const) {
    p = await openPopup(ext.context, { url: site, reply: { text, heldBack } });
    await both(p, `popup-${state}`, {
      ...POPUP_META,
      state,
      expectations: [
        'status line names why the bubble stayed hidden',
        'Translate anyway after it; when it wraps, its label starts on the text edge',
      ],
    });
    await p.close();
  }

  p = await openPopup(ext.context, {});
  await both(p, 'popup-restricted', {
    ...POPUP_META,
    state: 'restricted',
    expectations: [
      'no switch',
      '"Ega can\'t run on this page."',
      'page actions read as unavailable',
      'Translate clipboard, Open side panel and the text box stay available',
    ],
  });
  await p.close();

  p = await openPopup(ext.context, { url: site, reject: true });
  await both(p, 'popup-not-running', {
    ...POPUP_META,
    state: 'not-running',
    expectations: [
      '"Reload this page to use Ega here." then Reload page on the same line',
      'the info mark sits on the text line',
    ],
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
    expectations: [
      'a bottom-center toast with a close button',
      'the popup grew by the toast: it covers no control',
    ],
  });
  await p.close();

  p = await openPopup(ext.context, { url: site });
  await p.evaluate(() => (document.documentElement.style.zoom = '2'));
  await both(p, 'popup-zoom-200', {
    ...POPUP_META,
    state: 'zoom-200',
    expectations: [
      'at 200% zoom the popup widens to 720px and is capped at 600px tall, so it scrolls; nothing is cut off sideways',
    ],
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

  await seedSettings(ext.context, ext.extensionId, {
    defaultLang: 'ja',
    pickerEnabled: true,
    sitePrefs: {},
  });
  p = await openPopup(ext.context, { url: site });
  await both(p, 'popup-source-picked', {
    ...POPUP_META,
    state: 'source-picked',
    expectations: ['Japanese, the swap button and English in one row'],
  });
  await p.close();

  await seedSettings(ext.context, ext.extensionId, { defaultLang: 'auto', pickerEnabled: false });
  p = await openPopup(ext.context, { url: site });
  await both(p, 'popup-picker-off', {
    ...POPUP_META,
    state: 'picker-off',
    expectations: [
      'Pick element reads "Off in Settings" and is unavailable',
      'Translate page is still the one filled button',
    ],
  });
  await p.close();

  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: '',
    sitePrefs: {},
    pickerEnabled: true,
  });
  p = await openPopup(ext.context, { url: site });
  await p.locator('[data-ega-popup-no-backend]').waitFor();
  await both(p, 'popup-no-backend', {
    ...POPUP_META,
    state: 'no-backend',
    expectations: [
      '"Set up a backend to start." and the only filled button, on one row at the popup edge',
      'Translate page steps down',
    ],
  });
  await p.close();

  // The first run: nothing set up yet, on a tab opened before Ega was installed. The tallest state.
  p = await openPopup(ext.context, { url: site, reject: true });
  await p.locator('[data-ega-popup-no-backend]').waitFor();
  await both(p, 'popup-no-backend-not-running', {
    ...POPUP_META,
    state: 'no-backend-not-running',
    expectations: [
      'the setup row, then "Reload this page to use Ega here." with Reload page',
      'fits 600px with no scrollbar',
    ],
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
  let page = await ext.context.newPage();
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

  await page.close();

  // A fresh page: no queue, no queue notice. A selection that starts near the right edge, so the bubble has to clamp.
  page = await openPage('batch-page.html', { width: 420, height: 700 });
  await page.evaluate(() =>
    document.body.insertAdjacentHTML(
      'beforeend',
      '<p id="edge" style="text-align: right">yalla <span id="edge-word">habibi</span></p>',
    ),
  );
  await selectText(page, 'edge-word');
  await bubbleShown(page);
  await both(page, 'bubble-near-right-edge', {
    ...meta,
    viewport: { width: 420, height: 700 },
    state: 'near-right-edge',
    expectations: [
      'the selection starts near the right edge; the bubble is pulled left to stay inside the viewport',
    ],
  });

  // Spec 3.3: below covers the next line of the selection's own paragraph, so the bubble goes above when that is free.
  await page.setViewportSize(PAGE);
  await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<p id="multi" style="margin-top: 48px"><span id="m1">mar7aba ya habibi kifak</span> shu 3am ta3mel<br><span id="m2">yalla ma3ak shi 7elow</span> ktir 3njad<br>kif 7alak w shu akhbarak al-yom<br>w ba3den mnshuf ba3d</p>',
    );
    window.scrollTo(0, 0);
  });
  await selectText(page, 'm1');
  await bubbleShown(page);
  await both(page, 'bubble-first-line', {
    ...meta,
    state: 'first-line',
    expectations: ['a phrase on the first line: the bubble sits 4px above it, over free space'],
  });
  await selectText(page, 'm2');
  await bubbleShown(page);
  await both(page, 'bubble-mid-paragraph', {
    ...meta,
    state: 'mid-paragraph',
    expectations: [
      'text above and below: the bubble stays 4px below the selection, over the next line (spec 3.3)',
    ],
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

  // Below would leave the viewport and the text above is far off, so the bubble goes above.
  const low = await openPage('long-page.html', { width: 1000, height: 650 });
  await selectText(low, 'b2');
  await bubbleShown(low);
  await both(low, 'bubble-near-bottom', {
    ...meta,
    viewport: { width: 1000, height: 650 },
    state: 'near-bottom',
    expectations: ['the bubble sits 4px above the selected line, inside the viewport'],
  });
  await low.close();

  await writeStorage('ega.customLanguages', [
    {
      id: 'levantine-beirut',
      label: 'Levantine Arabic (Beirut street slang)',
      hint: '',
      examples: [],
      createdAt: 1,
    },
  ]);
  await seedSettings(ext.context, ext.extensionId, { defaultTargetLang: 'levantine-beirut' });
  const named = await openPage('batch-page.html');
  await selectText(named, 'c1');
  await bubbleShown(named);
  await both(named, 'bubble-long-language-name', {
    ...meta,
    state: 'long-language-name',
    expectations: ['the label ends in an ellipsis at 160px; the chevron stays whole'],
  });
  await named.close();
  await seedSettings(ext.context, ext.extensionId, { defaultTargetLang: 'en' });
  await writeStorage('ega.customLanguages', []);

  const dark = await openPage('hostile-page.html');
  await dark.evaluate(() => document.body.classList.add('dark'));
  await selectText(dark, 'c1');
  await bubbleShown(dark);
  await both(dark, 'bubble-light-theme-dark-page', {
    ...meta,
    state: 'light-theme-dark-page',
    expectations: ['the bubble edge and its text read on a black page'],
  });
  await dark.close();

  // The ring plays once per bubble, so each theme gets a fresh first-run bubble.
  for (const theme of ['light', 'dark'] as const) {
    await seedSettings(ext.context, ext.extensionId, { bubbleFirstRunSeen: false });
    const first = await ext.context.newPage();
    await first.setViewportSize(PAGE);
    await first.emulateMedia({ reducedMotion: 'no-preference' });
    await first.goto(`${ext.serverUrl}/batch-page.html`);
    await waitForTestHooks(first);
    await setTheme(first, theme);
    await selectText(first, 'c1');
    await expect.poll(async () => (await egaTest<number>(first, 'bubbleCount')) ?? 0).toBe(1);
    await first.waitForTimeout(150); // the first of three rings, mid-flight (no observable end state)
    await snap(first, theme === 'light' ? 'bubble-first-run' : 'bubble-first-run-dark', {
      ...meta,
      theme,
      state: 'first-run',
      expectations: ['the first-run ring shows around the bubble'],
    });
    await first.close();
  }
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
  await areas.locator('[data-ega-ms-mode="bilingual"]').click();
  await both(areas, 'picker-areas-show-both', {
    ...meta,
    state: 'areas-show-both',
    expectations: ['Show both is the checked segment: accent edge, tint and weight 600'],
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
  await both(page, 'page-blocks-inplace-pending', {
    ...meta,
    state: 'blocks-inplace-pending',
    expectations: ['each sent block keeps its text at 60% with one spinner at its end'],
  });
  release();
  await expect.poll(() => pillLabel(page), { timeout: 15_000 }).toMatch(/as you scroll/);
  await both(page, 'page-pill-idle-scroll', {
    ...meta,
    state: 'pill-idle-scroll',
    expectations: [
      '"N of 60 areas translated. The rest translate as you scroll."',
      'no progress line: nothing is in flight',
    ],
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
    expectations: [
      'the menu opens above the pill at its end, on its own surface; the row does not move',
      'More looks pressed while its menu is open',
      'More holds Remove translation',
    ],
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
    expectations: [
      '"Showing the original page"',
      'Show original has a solid accent fill; the page shows its own text',
    ],
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
      '"Couldn\'t translate the page." with the cause sentence; Open settings first, no raw "401"',
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
  await page.evaluate(() => document.body.classList.remove('dark'));
  await page.getByRole('button', { name: 'Close bar' }).click();
  await expect(page.locator('[data-ega-batch-progress]')).toHaveCount(0);
  await both(page, 'page-chip-after-close', {
    ...meta,
    state: 'chip-after-close',
    expectations: ['the pill is gone; each chip keeps Open settings, which works without it'],
  });
  await page.close();

  // A settings change while the settings error shows: Try again leads on the pill and on the chips.
  page = await ext.context.newPage();
  await page.setViewportSize(PAGE);
  await page.goto(`${ext.serverUrl}/hostile-page.html`);
  await waitForTestHooks(page);
  await sendPageTranslate('page:translateAll');
  await expect.poll(() => pillLabel(page), { timeout: 20_000 }).toMatch(/^Couldn't translate/);
  await seedSettings(ext.context, ext.extensionId, { streaming: false });
  await expect.poll(() => pillLabel(page), { timeout: 10_000 }).toMatch(/Settings changed/);
  await both(page, 'page-pill-settings-changed', {
    ...meta,
    state: 'pill-settings-changed',
    expectations: [
      '"Couldn\'t translate the page. Settings changed. Try again to use them."',
      'Try again (outlined) first, then Open settings',
      'each chip offers Try again',
    ],
  });
  await seedSettings(ext.context, ext.extensionId, { streaming: true });
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
      'the Hebrew originals stay right-aligned; each English translation reads left to right with its bar at its own start edge',
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
  // Registered last, so it runs first: the reply waits until release.
  let release = (): void => {};
  const held = new Promise<void>((r) => (release = r));
  await ext.context.route(ANTHROPIC, async (route) => {
    await held;
    await route.fallback();
  });
  let page = await ext.context.newPage();
  await page.setViewportSize(PAGE);
  await page.goto(`${ext.serverUrl}/inline-replace-page.html`);
  await waitForTestHooks(page);
  await selectText(page, 'target');
  await page.keyboard.press('Control+Shift+L');
  await page.locator('[data-ega-replaced][data-ega-pending]').waitFor({ timeout: 10_000 });
  await both(page, 'inline-pending', {
    ...meta,
    state: 'inline-pending',
    expectations: ['the selected text dimmed, with one spinner at its end'],
  });
  release();
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
  await page.locator('[data-ega-toast-action]').click();
  await expect(page.locator('.ega-toast')).toContainText('Ega is on for');
  await both(page, 'toast-plain', {
    ...meta,
    surface: 'unknown',
    state: 'toast-plain',
    expectations: ['"Ega is on for 127.0.0.1." with a check icon, a close button and no action'],
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

test('Page translate — pause, partial failure, Show both pending, RTL and focused chips', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    ...onlyBackends('anthropic'),
    pageTranslateMode: 'bilingual',
    streaming: true,
    cacheEnabled: false,
  });
  const meta = { surface: 'page-translate', viewport: PAGE } as const;

  // Show both, pending: the replies wait, so each block shows its sibling with the bar and a spinner.
  mockAnthropic(ext.context, {
    translation: 'Hello friend, how are you?',
    detectedLang: 'arabizi',
  });
  let release = (): void => {};
  const held = new Promise<void>((r) => (release = r));
  await ext.context.route(ANTHROPIC, async (route) => {
    await held;
    await route.fallback();
  });
  let page = await openPage('hostile-page.html');
  await sendPageTranslate('page:translateAll');
  await expect.poll(() => pillLabel(page)).toMatch(/^Translating/);
  await both(page, 'page-blocks-bilingual-pending', {
    ...meta,
    state: 'blocks-bilingual-pending',
    expectations: ['each block has a sibling with the side bar and one spinner, one line tall'],
  });
  release();
  await expect.poll(() => pillLabel(page), { timeout: 15_000 }).toMatch(/^Page translated/);
  await both(page, 'page-blocks-bilingual-heading', {
    ...meta,
    state: 'blocks-bilingual-heading',
    expectations: ["the heading's translation is 85% of the heading's size, at the same weight"],
  });
  await page.close();
  await resetRoutes(ext.context);

  // A rate limit pauses the queue with a countdown; it is not an error.
  await ext.context.route(ANTHROPIC, (route) =>
    route.fulfill({
      status: 429,
      headers: { 'retry-after': '12' },
      contentType: 'application/json',
      body: '{"type":"error","error":{"type":"rate_limit_error","message":"Number of requests has exceeded your rate limit"}}',
    }),
  );
  page = await openPage('hostile-page.html');
  await sendPageTranslate('page:translateAll');
  await expect.poll(() => pillLabel(page), { timeout: 15_000 }).toMatch(/^Paused/);
  await both(page, 'page-pill-rate-limit', {
    ...meta,
    state: 'pill-rate-limit',
    expectations: [
      '"Paused: Anthropic is limiting requests. Resuming in N s."',
      'Stop; no error mark',
    ],
  });
  await page.close();
  await resetRoutes(ext.context);

  // One block keeps failing with a server error; the rest translate.
  mockAnthropic(ext.context, {
    translation: 'Hello friend, how are you?',
    detectedLang: 'arabizi',
  });
  await ext.context.route(ANTHROPIC, async (route) => {
    if (route.request().postData()?.includes('kif 7alak')) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"type":"error","error":{"type":"api_error","message":"Internal server error"}}',
      });
      return;
    }
    await route.fallback();
  });
  page = await openPage('hostile-page.html');
  await sendPageTranslate('page:translateAll');
  await expect.poll(() => pillLabel(page), { timeout: 30_000 }).toMatch(/^Couldn't translate 1 of/);
  await both(page, 'page-pill-partial-fail', {
    ...meta,
    state: 'pill-partial-fail',
    expectations: [
      '"Couldn\'t translate 1 of 4 areas." and the cause in the catalog\'s words',
      'Try again (outlined) first, then Show original, More and Close bar',
      'one red chip on the failed block; the other blocks show their translation',
    ],
  });
  await page.close();
  await resetRoutes(ext.context);

  // Replace text on a right-to-left page.
  await seedSettings(ext.context, ext.extensionId, { pageTranslateMode: 'inplace' });
  mockAnthropic(ext.context, { translation: 'Hello world, this is the first paragraph.' });
  page = await openPage('rtl-page.html');
  await sendPageTranslate('page:translateAll');
  await expect.poll(() => pillLabel(page), { timeout: 15_000 }).toMatch(/^Page translated/);
  await both(page, 'page-blocks-rtl-inplace', {
    ...meta,
    state: 'blocks-rtl-inplace',
    expectations: ['each block reads in the translation, aligned to the right edge like the page'],
  });
  await page.close();
  await resetRoutes(ext.context);

  // Chips on a right-to-left page, then one with keyboard focus.
  await ext.context.route(ANTHROPIC, (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
    }),
  );
  page = await openPage('rtl-page.html');
  await sendPageTranslate('page:translateAll');
  await expect.poll(() => pillLabel(page), { timeout: 20_000 }).toMatch(/^Couldn't translate/);
  await both(page, 'page-chip-rtl', {
    ...meta,
    state: 'chip-rtl',
    expectations: [
      'each chip sits at the inline end of its block, the left side on RTL text',
      'inside, the chip reads left to right: mark, title, button',
    ],
  });
  // A key press first, so the browser draws the focus ring for the focus that follows.
  await page.keyboard.press('Tab');
  await page
    .locator('[data-ega-tx-error]')
    .first()
    .evaluate((h) => h.shadowRoot?.querySelector<HTMLElement>('button')?.focus());
  await both(page, 'page-chip-focus', {
    ...meta,
    state: 'chip-focus',
    expectations: [
      'the focused chip button has a 2px white ring on its edge and a 2px red band outside the white, so it shows on the white page',
    ],
  });
  await page.close();
  await resetRoutes(ext.context);

  // Show both on a grid of tiles and on FAQ summaries: each translation sits inside its tile or summary.
  await seedSettings(ext.context, ext.extensionId, { pageTranslateMode: 'bilingual' });
  mockAnthropic(ext.context, { translation: 'Translated tile text' });
  page = await openPage('tiles-page.html');
  await sendPageTranslate('page:translateAll');
  await expect.poll(() => pillLabel(page), { timeout: 15_000 }).toMatch(/^Page translated/);
  await both(page, 'page-blocks-tiles-summary', {
    ...meta,
    state: 'blocks-tiles-summary',
    expectations: [
      'the grid keeps 3 tiles a row; each translation sits inside its own tile',
      'each closed question shows its translation inside the summary line',
    ],
  });
  await page.close();
  await resetRoutes(ext.context);
});

test('Choose areas — order badges, and a toast above the bottom bar', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    ...onlyBackends('anthropic'),
  });
  const meta = { surface: 'page-translate', viewport: PAGE } as const;
  const page = await openPage('batch-page.html');
  await sendPageTranslate('page:chooseAreas');
  await expect.poll(async () => egaTest<boolean>(page, 'msIsActive')).toBe(true);
  expect(await egaTest<boolean>(page, 'msSelectById', 'c1')).toBe(true);
  expect(await egaTest<boolean>(page, 'msSelectById', 'c2')).toBe(true);
  // The shortcut with nothing selected shows a toast while the bar is up.
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.keyboard.press('Control+Shift+L');
  await waitToast(page);
  await both(page, 'areas-badges-toast', {
    ...meta,
    state: 'areas-badges-toast',
    expectations: [
      'order badges "1" and "2": white on solid blue, at least 12px',
      'the toast sits 8px above the bottom bar, never on it',
    ],
  });
  await both(page, 'areas-toast-narrow', {
    ...meta,
    viewport: { width: 400, height: 700 },
    state: 'areas-toast-narrow',
    expectations: ['the bar takes two rows; the toast sits above both'],
  });
  await page.close();
});

test('Toasts — first smart hold-back, reload, above the pill, and the full stack', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    ...onlyBackends('anthropic'),
    bubbleFirstRunSeen: true,
    smartBubbleBannerShown: false,
    sitePrefs: {},
    defaultDisplayMode: 'tooltip',
    pageTranslateMode: 'bilingual',
    streaming: true,
    cacheEnabled: false,
  });
  const meta = { surface: 'unknown', viewport: PAGE } as const;

  // English text in smart mode: the bubble stays hidden, and the first time a toast says why.
  let page = await openPage('batch-page.html');
  await selectText(page, 'c3');
  await waitToast(page);
  await both(page, 'toast-first-smart', {
    ...meta,
    state: 'toast-first-smart',
    expectations: [
      '"The bubble only shows on text that isn\'t English. Change this in Settings."',
      'Open settings and a close button',
    ],
  });
  await page.close();

  // An update deleted the code a page still running the old content script needs.
  page = await ext.context.newPage();
  await page.setViewportSize(PAGE);
  await page.route('**/batch-progress-*.js', (route) => route.abort());
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);
  await sendPageTranslate('page:translateAll');
  await page.locator('[data-ega-toast-action]').waitFor({ timeout: 10_000 });
  await both(page, 'toast-reload', {
    ...meta,
    state: 'toast-reload',
    expectations: ['"Ega was updated. Reload the page to keep using it." with Reload page'],
  });
  await page.close();

  // With the pill up, a toast sits above it.
  const short = { width: 1000, height: 420 };
  mockAnthropic(ext.context, {
    translation: 'Hello friend, how are you?',
    detectedLang: 'arabizi',
  });
  page = await openPage('hostile-page.html', short);
  await sendPageTranslate('page:translateAll');
  await expect.poll(() => pillLabel(page), { timeout: 15_000 }).toMatch(/^Page translated/);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.keyboard.press('Control+Shift+L');
  await waitToast(page);
  await both(page, 'toast-above-pill', {
    ...meta,
    viewport: short,
    state: 'toast-above-pill',
    expectations: ['the toast sits 8px above the pill and covers none of it'],
  });

  // Tooltip near the bottom, then a toast: all three layers at once.
  await page.locator('[data-ega-toast-close]').click();
  await page.evaluate(() => {
    const el = document.getElementById('c3') as HTMLElement;
    el.scrollIntoView({ block: 'end' });
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await page.keyboard.press('Control+Shift+L');
  await expect.poll(async () => egaTest<number>(page, 'tooltipCount')).toBe(1);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.keyboard.press('Control+Shift+L');
  await waitToast(page);
  await both(page, 'stack-tooltip-pill-toast', {
    ...meta,
    viewport: short,
    state: 'stack-tooltip-pill-toast',
    expectations: ['the toast is on top, the tooltip over the pill, the pill under both'],
  });
  await page.close();
  await resetRoutes(ext.context);
});
