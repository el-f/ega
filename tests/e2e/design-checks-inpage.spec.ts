import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  onlyBackends,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

// DOM probes for the rules of the page-popup redesign that a machine can count; each one fails the build.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    ...onlyBackends('anthropic'),
    bubbleFirstRunSeen: true,
    smartBubbleBannerShown: true,
    cacheEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

/** Every visible control and text node in a root, measured. */
async function probe(
  page: Page,
  inShadow: boolean,
): Promise<{
  smallText: string[];
  smallTargets: string[];
  titles: string[];
  disabledInToolbars: number;
  nameMismatch: string[];
  sizes: number[];
}> {
  return page.evaluate((shadow) => {
    const root: ParentNode = shadow
      ? (document.getElementById('ega-shadow-host')?.shadowRoot ?? document)
      : document;
    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const smallText: string[] = [];
    const sizes = new Set<number>();
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      if (!visible(el) || el.closest('.ega-sr-only, [aria-hidden="true"]')) continue;
      const own = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim() !== '',
      );
      if (!own) continue;
      const px = Number.parseFloat(getComputedStyle(el).fontSize);
      sizes.add(px);
      if (px < 12) {
        smallText.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}"`);
      }
    }
    const buttons = [...root.querySelectorAll<HTMLElement>('button, a[href], [role="switch"]')]
      // The backend chip belongs to the shared header (side panel slice); it is reported there.
      .filter((el) => visible(el) && !el.closest('.ega-sr-only, .active-backend-chip'));
    const smallTargets = buttons
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width < 24 || r.height < 24;
      })
      .map((el) => el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 30));
    // Label in name: a control's accessible name starts with the words it shows.
    const nameMismatch = buttons
      .map((el) => ({
        text: el.innerText.replace(/\s+/g, ' ').trim(),
        name: (el.getAttribute('aria-label') ?? el.innerText).replace(/\s+/g, ' ').trim(),
      }))
      .filter(({ text, name }) => text !== '' && !name.startsWith(text))
      .map(({ text, name }) => `"${name}" does not start with "${text}"`);
    const titles = [...root.querySelectorAll('[title]')].map((el) => el.tagName.toLowerCase());
    const disabledInToolbars = root.querySelectorAll('[role="toolbar"] [disabled]').length;
    return {
      smallText,
      smallTargets,
      titles,
      disabledInToolbars,
      nameMismatch,
      sizes: [...sizes].sort(),
    };
  }, inShadow);
}

/** Every toolbar is one tab stop, and ArrowRight (or ArrowDown on a vertical one) moves focus along it. */
async function checkToolbars(page: Page, inShadow: boolean): Promise<void> {
  const count = await page.evaluate(
    (shadow) =>
      (shadow
        ? document.getElementById('ega-shadow-host')?.shadowRoot
        : document
      )?.querySelectorAll('[role="toolbar"]').length ?? 0,
    inShadow,
  );
  for (let i = 0; i < count; i++) {
    const bar = await page.evaluate(
      ({ shadow, at }) => {
        const root = shadow ? document.getElementById('ega-shadow-host')?.shadowRoot : document;
        const el = root?.querySelectorAll<HTMLElement>('[role="toolbar"]')[at];
        const buttons = [...(el?.querySelectorAll<HTMLElement>('button') ?? [])].filter(
          (b) => b.getClientRects().length > 0,
        );
        buttons.find((b) => b.tabIndex === 0)?.focus();
        return {
          total: buttons.length,
          stops: buttons.filter((b) => b.tabIndex === 0).length,
          vertical: el?.getAttribute('aria-orientation') === 'vertical',
        };
      },
      { shadow: inShadow, at: i },
    );
    expect(bar.stops, `toolbar ${i} has one tab stop`).toBe(1);
    if (bar.total < 2) continue;
    const before = await activeLabel(page, inShadow);
    await page.keyboard.press(bar.vertical ? 'ArrowDown' : 'ArrowRight');
    expect(await activeLabel(page, inShadow), `an arrow moves along toolbar ${i}`).not.toBe(before);
  }
}

function activeLabel(page: Page, inShadow: boolean): Promise<string> {
  return page.evaluate((shadow) => {
    const active = shadow
      ? document.getElementById('ega-shadow-host')?.shadowRoot?.activeElement
      : document.activeElement;
    return active ? (active.getAttribute('aria-label') ?? active.textContent.trim()) : '';
  }, inShadow);
}

/** The popup as a page over a stubbed active tab; the URL and the page's answer decide its state. */
/** `url` left out is what Chrome gives an extension with no "tabs" permission on a page it cannot run on. */
/** `clipboard: null` is a clipboard read Chrome refuses. */
async function openPopup(
  tab: {
    url?: string;
    reply?: unknown;
    reject?: boolean;
    clipboard?: string | null;
  },
  opts: { reducedMotion?: boolean } = {},
): Promise<Page> {
  const popup = await ext.context.newPage();
  if (opts.reducedMotion) await popup.emulateMedia({ reducedMotion: 'reduce' });
  await popup.addInitScript((t) => {
    const g = globalThis as unknown as {
      chrome: { tabs: { query: unknown; sendMessage: unknown } };
    };
    g.chrome.tabs.query = async () => [{ id: 7, url: t.url, windowId: 1 }];
    g.chrome.tabs.sendMessage = async (_id: number, msg: { kind: string }) => {
      if (t.reject)
        throw new Error('Could not establish connection. Receiving end does not exist.');
      return msg.kind === 'ega:get-selection' ? (t.reply ?? { text: '' }) : { ok: true };
    };
    if (t.clipboard !== undefined) {
      // Granted already: a permission prompt would wait for a click no test makes.
      (g.chrome as unknown as { permissions: { contains: unknown } }).permissions.contains =
        async () => true;
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          readText: async () => {
            if (t.clipboard === null) throw new DOMException('Read permission denied.');
            return t.clipboard;
          },
        },
        configurable: true,
      });
    }
  }, tab);
  await popup.setViewportSize({ width: 360, height: 640 });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await popup.getByRole('button', { name: 'Translate page' }).waitFor();
  return popup;
}

/** Buttons painted with the accent fill. */
function filledButtons(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.background = 'var(--color-accent)';
    document.body.append(probe);
    const accent = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return [...document.querySelectorAll('button')].filter(
      (b) => getComputedStyle(b).backgroundColor === accent,
    ).length;
  });
}

const SITE = 'https://example.com/';
const POPUP_STATES: {
  name: string;
  tab: { url?: string; reply?: unknown; reject?: boolean };
  seed?: Record<string, unknown>;
  /** The page can be translated, so Translate page (or the setup card) is the one filled button. */
  usable: boolean;
}[] = [
  { name: 'default', tab: { url: SITE }, usable: true },
  {
    name: 'held back',
    tab: { url: SITE, reply: { text: 'hi', heldBack: { reason: 'english' } } },
    usable: true,
  },
  { name: 'text pre-filled', tab: { url: SITE, reply: { text: 'shu 3am ta3mel' } }, usable: true },
  { name: 'restricted', tab: {}, usable: false },
  { name: 'not running', tab: { url: SITE, reject: true }, usable: false },
  {
    name: 'site off',
    tab: { url: SITE },
    seed: { sitePrefs: { 'https://example.com': { disabled: true } } },
    usable: false,
  },
  {
    name: 'no backend',
    tab: { url: SITE },
    seed: { anthropicApiKey: '', sitePrefs: {} },
    usable: true,
  },
  // The first run: nothing set up yet, on a tab opened before Ega was installed.
  {
    name: 'no backend, page not running',
    tab: { url: SITE, reject: true },
    seed: { anthropicApiKey: '', sitePrefs: {} },
    usable: false,
  },
  {
    name: 'no backend, bubble held back',
    tab: { url: SITE, reply: { text: 'hi', heldBack: { reason: 'english' } } },
    seed: { anthropicApiKey: '', sitePrefs: {} },
    usable: true,
  },
];

test('popup, every state: at most one filled button, one-line tools, toolbar stops, 12px, 24px, names', async () => {
  test.slow();
  for (const state of POPUP_STATES) {
    if (state.seed) await seedSettings(ext.context, ext.extensionId, state.seed);
    const popup = await openPopup(state.tab);
    await popup.waitForTimeout(300); // wait for the backend chip's probe to settle (no observable end state)

    // Chrome caps a toolbar popup at 600px; past it the popup scrolls.
    const bodyHeight = await popup.evaluate(() => document.body.getBoundingClientRect().height);
    expect(bodyHeight, `${state.name}: fits the 600px popup`).toBeLessThanOrEqual(600);

    const filled = await filledButtons(popup);
    if (state.usable) expect(filled, `${state.name}: one filled button`).toBe(1);
    else expect(filled, `${state.name}: no more than one filled button`).toBeLessThanOrEqual(1);

    const toolRows = await popup.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-ega-popup-tools] button')].map(
        (b) => b.getBoundingClientRect().height <= 40,
      ),
    );
    expect(toolRows.every(Boolean), `${state.name}: every tool row is one line`).toBe(true);

    const p = await probe(popup, false);
    expect(p.smallText, state.name).toEqual([]);
    expect(p.smallTargets, state.name).toEqual([]);
    expect(p.titles, state.name).toEqual([]);
    expect(p.disabledInToolbars, state.name).toBe(0);
    expect(p.nameMismatch, state.name).toEqual([]);
    expect(
      p.sizes.length,
      `${state.name}: at most 3 type sizes (${p.sizes.join(', ')})`,
    ).toBeLessThanOrEqual(3);
    await checkToolbars(popup, false);
    await popup.close();
  }
});

test('bubble and picker bar: 12px floor, 24px targets, toolbar stops, the bubble named by its label', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);
  await page.evaluate(() => {
    const el = document.getElementById('c1') as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });
  await expect.poll(async () => egaTest<number>(page, 'bubbleCount')).toBe(1);
  const named = await page.evaluate(() => {
    const b = document.getElementById('ega-shadow-host')?.shadowRoot?.querySelector('.bubble');
    return { label: b?.textContent.trim(), aria: b?.getAttribute('aria-label') ?? null };
  });
  expect(named).toEqual({ label: 'Translate to English', aria: null });
  // A long target name may end in an ellipsis; the label is marked as an allowed truncation.
  await expect(page.locator('.bubble-label[data-ega-truncates]')).toHaveCount(1);
  let p = await probe(page, true);
  expect(p.smallText).toEqual([]);
  expect(p.smallTargets).toEqual([]);
  expect(p.titles).toEqual([]);
  expect(p.nameMismatch).toEqual([]);

  const sw = ext.context.serviceWorkers()[0];
  await sw?.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { kind: 'page:chooseAreas' });
  });
  await expect.poll(async () => egaTest<boolean>(page, 'msIsActive')).toBe(true);
  // The bar keeps its place while the status changes length, so a control never moves under the pointer.
  const translateLeft = (): Promise<number> =>
    page.evaluate(
      () =>
        document
          .getElementById('ega-shadow-host')
          ?.shadowRoot?.querySelector('[data-ega-ms-translate]')
          ?.getBoundingClientRect().left ?? -1,
    );
  const steady = await translateLeft();
  expect(await egaTest<boolean>(page, 'msSelectById', 'c1')).toBe(true);
  expect(await translateLeft()).toBe(steady);
  await page.mouse.click(3, 3);
  await expect(page.locator('[data-ega-ms-count]')).toContainText('Pick a block inside the page');
  expect(await translateLeft()).toBe(steady);
  p = await probe(page, true);
  expect(p.smallText).toEqual([]);
  expect(p.smallTargets).toEqual([]);
  expect(p.disabledInToolbars).toBe(0);
  expect(p.nameMismatch).toEqual([]);
  await checkToolbars(page, true);
});

test('page chips keep their own font and a 24px button on a hostile page', async () => {
  await ext.context.route('https://api.anthropic.com/v1/messages', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":"upstream exploded"}',
    }),
  );
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/hostile-page.html`);
  await waitForTestHooks(page);
  // A CSS reset that zeroes every margin, as Tailwind's preflight does.
  await page.addStyleTag({ content: '* { margin: 0 }' });
  const sw = ext.context.serviceWorkers()[0];
  await sw?.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { kind: 'page:chooseAreas' });
  });
  await expect.poll(async () => egaTest<boolean>(page, 'msIsActive')).toBe(true);
  expect(await egaTest<boolean>(page, 'msSelectById', 'c1')).toBe(true);
  expect(await egaTest<boolean>(page, 'msFire')).toBe(true);
  const chip = page.locator('[data-ega-tx-error]').first();
  await chip.waitFor({ timeout: 30_000 });
  const look = await chip.evaluate((host) => {
    const root = host.shadowRoot;
    const c = root?.querySelector('.chip') as HTMLElement;
    const btn = root?.querySelector('button') as HTMLElement | null;
    const s = getComputedStyle(c);
    return {
      font: s.fontFamily,
      size: s.fontSize,
      spacing: s.letterSpacing,
      margin: getComputedStyle(host).marginInlineStart,
      text: c.textContent,
      button: btn?.getBoundingClientRect().height ?? 0,
      titles: root?.querySelectorAll('[title]').length ?? 0,
    };
  });
  expect(look.font.startsWith('system-ui')).toBe(true);
  expect(look.size).toBe('12px');
  // The page's letter-spacing on every element and its margin reset reach neither the chip text nor the host.
  expect(look.spacing).toBe('normal');
  expect(look.margin).not.toBe('0px');
  expect(look.button).toBeGreaterThanOrEqual(24);
  expect(look.titles).toBe(0);
  // The catalog title, never the provider's status or words.
  expect(look.text).not.toMatch(/\b[1-5]\d\d\b|HTTP|upstream|[A-Z]{2,}_[A-Z]+/);

  // The focus ring changes the white page just under the chip by at least 3:1, not only the chip's own red.
  const button = chip.locator('button');
  const box = await button.boundingBox();
  if (!box) throw new Error('chip button has no box');
  const at = { x: Math.round(box.x + box.width / 2), y: Math.floor(box.y + box.height + 3) };
  const pixel = async (): Promise<number[]> => {
    const png = PNG.sync.read(await page.screenshot({ clip: { ...at, width: 1, height: 1 } }));
    return [png.data[0] ?? 0, png.data[1] ?? 0, png.data[2] ?? 0];
  };
  const unfocused = await pixel();
  await page.keyboard.press('Tab');
  await button.evaluate((b) => (b as HTMLElement).focus());
  const focused = await pixel();
  expect(
    contrast(unfocused, focused),
    `${unfocused.join()} vs ${focused.join()}`,
  ).toBeGreaterThanOrEqual(3);
});

/** WCAG contrast ratio of two sRGB colours. */
function contrast(a: number[], b: number[]): number {
  const lum = (c: number[]): number => {
    const [r = 0, g = 0, bl = 0] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

test('a toast in a picker mode sits above the bottom bar, wide and narrow', async () => {
  const page = await ext.context.newPage();
  test.slow();
  mockAnthropic(ext.context, {
    translation: 'Hello friend, how are you?',
    detectedLang: 'arabizi',
  });
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto(`${ext.serverUrl}/hostile-page.html`);
  await waitForTestHooks(page);
  // A settled pill stays on the page through a picker mode, hidden; a hidden pill must not place the toast.
  await translatePage();
  await expect.poll(() => pillLabel(page), { timeout: 20_000 }).toMatch(/^Page translated/);
  const pill = await toastOver(page, '[data-ega-batch-progress]');
  expect(pill.gap, 'above the pill').toBeGreaterThanOrEqual(4);
  expect(pill.gap, 'above the pill').toBeLessThanOrEqual(12);
  // A private field: its refusal is the bar's longest status, and it wraps the bar at desktop widths too.
  await page.evaluate(() => {
    const f = document.createElement('input');
    f.type = 'password';
    f.id = 'ega-test-pw';
    f.style.cssText = 'position:fixed;top:8px;left:8px;width:120px;z-index:1';
    document.body.append(f);
  });
  await chooseAreas();
  await expect.poll(async () => egaTest<boolean>(page, 'msIsActive')).toBe(true);

  const fails: string[] = [];
  // Linux draws the UI font in DejaVu Sans, about as wide as Verdana and 14-22% wider than Segoe UI, so the
  // bar wraps sooner there; both are tried on every platform.
  for (const font of ['', 'Verdana, "DejaVu Sans", sans-serif']) {
    await setUiFont(page, font);
    // Idle first, then the refusal, which holds the status for 4 s.
    for (const refusal of [false, true]) {
      for (const width of [1280, 1000, 640, 560, 400, 360]) {
        await page.setViewportSize({ width, height: 700 });
        if (refusal) await page.click('#ega-test-pw');
        await settle(page);
        const m = await toastOver(page, '.ega-picker-bar');
        const name = `${font || 'default font'}, ${width}px, ${refusal ? 'refusal' : 'idle'}`;
        // Spec 1.3: 8px above the bar. A negative gap is a toast over the bar's status or controls.
        if (!(m.gap >= 4 && m.gap <= 12))
          fails.push(`${name}: gap ${m.gap} over a ${m.height}px bar`);
        // Spec 6.3: a bar on two or more rows takes the card radius, and only then.
        if (m.height > 48 && m.radius !== m.cardRadius) fails.push(`${name}: radius ${m.radius}`);
        if (m.wrapped !== m.height > 48) fails.push(`${name}: data-ega-wrapped is ${m.wrapped}`);
        // Spec 6.2: wrapped controls stay end-aligned, on every row they take.
        const ragged = await controlRowsSpread(page);
        if (ragged > 1) fails.push(`${name}: control rows end ${ragged}px apart`);
      }
    }
  }
  await setUiFont(page, '');
  expect(fails).toEqual([]);

  // Out of the mode the pill shows again, and the toast goes back above it.
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.keyboard.press('Escape');
  await expect.poll(async () => egaTest<boolean>(page, 'msIsActive')).toBe(false);
  await settle(page);
  // The pill plays its entry rise again as it comes back; measure where it comes to rest.
  await page.evaluate(() =>
    Promise.all(
      (
        document
          .getElementById('ega-shadow-host')
          ?.shadowRoot?.querySelector('[data-ega-batch-progress]')
          ?.getAnimations() ?? []
      ).map((a) => a.finished),
    ),
  );
  const back = await toastOver(page, '[data-ega-batch-progress]');
  expect(back.gap, 'above the pill again').toBeGreaterThanOrEqual(4);
  expect(back.gap, 'above the pill again').toBeLessThanOrEqual(12);
});

test('the picker bar key list opens over a toast, never under it', async () => {
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);
  await chooseAreas();
  await expect.poll(async () => egaTest<boolean>(page, 'msIsActive')).toBe(true);
  // The keyboard way into the bar (D52); the list opens 8px above the bar, where a toast sits.
  await page.keyboard.press('?');
  const covered = await page.evaluate(() => {
    const root = document.getElementById('ega-shadow-host')?.shadowRoot;
    const toast = document.createElement('div');
    toast.className = 'ega-toast';
    toast.style.animation = 'none';
    toast.textContent =
      'Select some text first, then press the shortcut. It stays until you close it.';
    root?.querySelector('.ega-root')?.append(toast);
    const list = root?.querySelector<HTMLElement>('.ega-picker-bar .keys:not([hidden])');
    const t = toast.getBoundingClientRect();
    const l = list?.getBoundingClientRect();
    const overlap =
      !!l && l.left < t.right && l.right > t.left && l.top < t.bottom && l.bottom > t.top;
    const hidden: string[] = list ? [] : ['no key list'];
    for (const row of list ? [...list.children] : []) {
      const r = row.getBoundingClientRect();
      for (let x = r.left + 2; x < r.right - 2; x += 8) {
        const hit = root?.elementFromPoint(x, r.top + r.height / 2);
        if (!hit || !list?.contains(hit)) {
          hidden.push(row.textContent.trim());
          break;
        }
      }
    }
    toast.remove();
    return { overlap, hidden };
  });
  // The check means something only where the two meet.
  expect(covered.overlap, 'the list and the toast share space').toBe(true);
  expect(covered.hidden).toEqual([]);
});

/** How far apart the ends of the picker bar's control rows are; 0 when every row ends at the same edge. */
function controlRowsSpread(page: Page): Promise<number> {
  return page.evaluate(() => {
    const controls = document
      .getElementById('ega-shadow-host')
      ?.shadowRoot?.querySelector('.ega-picker-bar .controls');
    const ends = new Map<number, number>();
    for (const c of controls?.children ?? []) {
      const r = c.getBoundingClientRect();
      if (r.width === 0) continue;
      const row = Math.round(r.top);
      ends.set(row, Math.max(ends.get(row) ?? 0, r.right));
    }
    const all = [...ends.values()];
    return all.length > 0 ? Math.round(Math.max(...all) - Math.min(...all)) : 0;
  });
}

async function chooseAreas(): Promise<void> {
  const sw = ext.context.serviceWorkers()[0];
  await sw?.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { kind: 'page:chooseAreas' });
  });
}

/** Swaps Ega's UI font inside its shadow root; '' puts the default back. */
function setUiFont(page: Page, font: string): Promise<void> {
  return page.evaluate((f) => {
    const root = document.getElementById('ega-shadow-host')?.shadowRoot;
    root?.getElementById('ega-test-font')?.remove();
    if (!f) return;
    const style = document.createElement('style');
    style.id = 'ega-test-font';
    style.textContent = `:host { --font-ui: ${f}; }`;
    root?.append(style);
  }, font);
}

/** Where a toast lands over the bottom-slot element `sel`, plus that element's height and corner radius. The
 *  sheet alone places a toast, so a bare toast box shows where any toast lands. */
function toastOver(
  page: Page,
  sel: string,
): Promise<{
  gap: number;
  height: number;
  radius: string;
  cardRadius: string;
  wrapped: boolean;
}> {
  return page.evaluate((s) => {
    const root = document.getElementById('ega-shadow-host')?.shadowRoot;
    const ega = root?.querySelector('.ega-root');
    const toast = document.createElement('div');
    toast.className = 'ega-toast';
    toast.style.animation = 'none';
    toast.textContent = 'Select some text first, then press the shortcut.';
    ega?.append(toast);
    const probe = document.createElement('div');
    probe.style.borderRadius = 'var(--radius-lg)';
    ega?.append(probe);
    const cardRadius = getComputedStyle(probe).borderTopLeftRadius;
    probe.remove();
    const t = toast.getBoundingClientRect();
    const el = root?.querySelector(s);
    const bar = el?.getBoundingClientRect();
    toast.remove();
    return {
      gap: bar && bar.height > 0 ? Math.round(bar.top - t.bottom) : Number.NaN,
      height: Math.round(bar?.height ?? 0),
      radius: el ? getComputedStyle(el).borderTopLeftRadius : '',
      cardRadius,
      wrapped: el?.hasAttribute('data-ega-wrapped') ?? false,
    };
  }, sel);
}

/** Two frames: a ResizeObserver callback has run and its style change is laid out. */
function settle(page: Page): Promise<void> {
  return page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
}

async function translatePage(): Promise<void> {
  const sw = ext.context.serviceWorkers()[0];
  await sw?.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { kind: 'page:translateAll' });
  });
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

test('settled pill and toast: 12px floor, 24px targets, one toolbar stop, label in name, no titles', async () => {
  await ext.context.route('https://api.anthropic.com/v1/messages', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
    }),
  );
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/hostile-page.html`);
  await waitForTestHooks(page);
  await translatePage();
  await expect.poll(() => pillLabel(page), { timeout: 20_000 }).toMatch(/^Couldn't translate/);
  // A toast with the pill up: the shortcut with nothing selected.
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.keyboard.press('Control+Shift+L');
  await page.waitForFunction(
    () => !!document.getElementById('ega-shadow-host')?.shadowRoot?.querySelector('.ega-toast'),
  );
  const p = await probe(page, true);
  expect(p.smallText).toEqual([]);
  expect(p.smallTargets).toEqual([]);
  expect(p.titles).toEqual([]);
  expect(p.disabledInToolbars).toBe(0);
  expect(p.nameMismatch).toEqual([]);
  await checkToolbars(page, true);
});

test('tooltip, pill and toast stack in layer order: toast on top, then tooltip, then pill', async () => {
  await seedSettings(ext.context, ext.extensionId, { pageTranslateMode: 'bilingual' });
  mockAnthropic(ext.context, {
    translation: 'Hello friend, how are you?',
    detectedLang: 'arabizi',
  });
  const page = await ext.context.newPage();
  // Short, so the tooltip opens near the bottom where the pill sits.
  await page.setViewportSize({ width: 1000, height: 420 });
  await page.goto(`${ext.serverUrl}/hostile-page.html`);
  await waitForTestHooks(page);
  await translatePage();
  await expect.poll(() => pillLabel(page), { timeout: 20_000 }).toMatch(/^Page translated/);
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
  await page.waitForFunction(
    () => !!document.getElementById('ega-shadow-host')?.shadowRoot?.querySelector('.ega-toast'),
  );
  const stack = await page.evaluate(() => {
    const root = document.getElementById('ega-shadow-host')?.shadowRoot;
    const box = (sel: string): DOMRect | undefined =>
      root?.querySelector(sel)?.getBoundingClientRect();
    const at = (x: number, y: number): Element | null => root?.elementFromPoint(x, y) ?? null;
    const z = (sel: string): number => {
      const el = root?.querySelector(sel);
      return el ? Number(getComputedStyle(el).zIndex) : Number.NaN;
    };
    const toast = box('.ega-toast');
    const tip = box('.tooltip');
    const pill = box('[data-ega-batch-progress]');
    const toastTop = toast
      ? at(toast.left + toast.width / 2, toast.top + toast.height / 2)?.closest('.ega-toast') !==
        null
      : false;
    let overlapTop: boolean | null = null;
    if (tip && pill) {
      const left = Math.max(tip.left, pill.left);
      const right = Math.min(tip.right, pill.right);
      const top = Math.max(tip.top, pill.top);
      const bottom = Math.min(tip.bottom, pill.bottom);
      if (left < right && top < bottom) {
        overlapTop = at((left + right) / 2, (top + bottom) / 2)?.closest('.tooltip') !== null;
      }
    }
    return {
      toastTop,
      overlapTop,
      order: [z('[data-ega-batch-progress]'), z('.tooltip'), z('.ega-toast')],
    };
  });
  expect(stack.toastTop).toBe(true);
  // Only a real overlap can show which layer wins; without one the order below still has to hold.
  if (stack.overlapTop !== null) expect(stack.overlapTop).toBe(true);
  const [pillZ = Number.NaN, tipZ = Number.NaN, toastZ = Number.NaN] = stack.order;
  expect(pillZ).toBeLessThan(tipZ);
  expect(tipZ).toBeLessThan(toastZ);
});

test('popup, every state: a one- or two-line toast covers no control and the popup stays within 600px', async () => {
  test.slow();
  const toasts = [
    { clipboard: '   ', text: 'The clipboard is empty. Copy some text first.' },
    {
      clipboard: null,
      text: "Ega couldn't read the clipboard. Allow clipboard access, then try again.",
    },
  ];
  const fails: string[] = [];
  for (const state of POPUP_STATES) {
    if (state.seed) await seedSettings(ext.context, ext.extensionId, state.seed);
    for (const t of toasts) {
      const popup = await openPopup({ ...state.tab, clipboard: t.clipboard });
      await popup.getByRole('button', { name: 'Translate clipboard' }).click();
      await popup.getByText(t.text).waitFor();
      await expect
        .poll(() =>
          popup.evaluate(() =>
            document.querySelector('[data-sonner-toast]')?.getAttribute('data-mounted'),
          ),
        )
        .toBe('true');
      await popup.waitForTimeout(100); // the body makes room once the toast is measured
      // The popup is as tall as its body, up to 600px; past that Chrome scrolls it.
      const height = await popup.evaluate(() =>
        Math.ceil(document.body.getBoundingClientRect().height),
      );
      if (height > 600) fails.push(`${state.name}, "${t.text}": body ${height}px`);
      await popup.setViewportSize({ width: 360, height: Math.min(600, height) });
      const covered = await popup.evaluate(() => {
        const toast = document.querySelector('[data-sonner-toast]')?.getBoundingClientRect();
        if (!toast) return ['no toast'];
        return [
          ...document.querySelectorAll<HTMLElement>('button, textarea, select, [role="switch"]'),
        ]
          .filter((el) => !el.closest('[data-sonner-toast]'))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.bottom > toast.top &&
              r.top < toast.bottom &&
              r.right > toast.left &&
              r.left < toast.right
            );
          })
          .map((el) => el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 30));
      });
      if (covered.length > 0) {
        fails.push(`${state.name}, "${t.text}": covers ${covered.join(', ')}`);
      }
      await popup.close();
    }
  }
  expect(fails).toEqual([]);
});

test('popup, every state, reduced motion: focus starts on a control, not on the page body', async () => {
  test.slow();
  const fails: string[] = [];
  for (const state of POPUP_STATES) {
    if (state.seed) await seedSettings(ext.context, ext.extensionId, state.seed);
    const popup = await openPopup(state.tab, { reducedMotion: true });
    // The start control is focused right after the body shows; give the focus call its turn.
    await popup.waitForTimeout(300);
    const active = await popup.evaluate(() => document.activeElement?.tagName ?? 'none');
    if (active === 'BODY' || active === 'none') fails.push(state.name);
    await popup.close();
  }
  expect(fails).toEqual([]);
});

/** WCAG 1.4.12: the user's text-spacing override must not clip a control. */
const TEXT_SPACING =
  '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-block-end: 2em !important; }';

function clippedUnderTextSpacing(page: Page, inShadow: boolean): Promise<string[]> {
  return page.evaluate(
    ({ shadow, css }) => {
      const root = shadow ? document.getElementById('ega-shadow-host')?.shadowRoot : document;
      if (!root) return ['no Ega root'];
      const style = document.createElement('style');
      style.textContent = css;
      (shadow ? root : document.head).append(style);
      return [...root.querySelectorAll<HTMLElement>('button, label, [role="switch"]')]
        .filter((el) => el.getBoundingClientRect().width > 1 && !el.closest('.active-backend-chip'))
        .filter(
          (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
        )
        .map((el) => el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 30));
    },
    { shadow: inShadow, css: TEXT_SPACING },
  );
}

test('text spacing override: nothing in the popup, picker bar or pill is clipped', async () => {
  const popup = await openPopup({ url: SITE });
  expect(await clippedUnderTextSpacing(popup, false)).toEqual([]);
  // Positive control: a control that is too narrow for its words is reported.
  await popup.evaluate(() => {
    const b = document.createElement('button');
    b.textContent = 'Far too long a label';
    b.style.cssText = 'width:40px;overflow:hidden;white-space:nowrap';
    document.body.append(b);
  });
  expect(await clippedUnderTextSpacing(popup, false)).toEqual(['Far too long a label']);
  await popup.close();

  mockAnthropic(ext.context, {
    translation: 'Hello friend, how are you?',
    detectedLang: 'arabizi',
  });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);
  const sw = ext.context.serviceWorkers()[0];
  await sw?.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { kind: 'page:chooseAreas' });
  });
  await expect.poll(async () => egaTest<boolean>(page, 'msIsActive')).toBe(true);
  expect(await egaTest<boolean>(page, 'msSelectById', 'c1')).toBe(true);
  expect(await clippedUnderTextSpacing(page, true)).toEqual([]);
  expect(await egaTest<boolean>(page, 'msFire')).toBe(true);
  await expect.poll(() => pillLabel(page), { timeout: 15_000 }).toMatch(/^Page translated/);
  expect(await clippedUnderTextSpacing(page, true)).toEqual([]);
});

test('on a right-to-left page the error chip still reads left to right', async () => {
  await ext.context.route('https://api.anthropic.com/v1/messages', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
    }),
  );
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/rtl-page.html`);
  await waitForTestHooks(page);
  await translatePage();
  await expect.poll(() => pillLabel(page), { timeout: 20_000 }).toMatch(/^Couldn't translate/);
  const chip = await page
    .locator('[data-ega-tx-error]')
    .first()
    .evaluate((host) => {
      const c = host.shadowRoot?.querySelector('.chip') as HTMLElement;
      const left = (el: Element | null | undefined): number =>
        el?.getBoundingClientRect().left ?? -1;
      return {
        host: getComputedStyle(host).direction,
        chip: getComputedStyle(c).direction,
        mark: left(c.querySelector('svg')),
        title: left(c.querySelector('span')),
        button: left(c.querySelector('button')),
      };
    });
  // The chip sits in the page's right-to-left line, but Ega's English inside it reads mark, title, button.
  expect(chip.host).toBe('rtl');
  expect(chip.chip).toBe('ltr');
  expect(chip.mark).toBeLessThan(chip.title);
  expect(chip.title).toBeLessThan(chip.button);
});
