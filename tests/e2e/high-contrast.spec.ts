import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  sendFromPanel,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

// The unit tests can only read these rules' source (jsdom has no CSS engine); here Chromium computes them.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

async function forceColors(page: Page): Promise<void> {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
}

async function outlineOf(el: Locator): Promise<string> {
  return el.evaluate((n) => {
    const s = getComputedStyle(n);
    return `${s.outlineStyle} ${s.outlineWidth}`;
  });
}

/** The mode keeps outlines and drops box-shadows, so the first Tab stop must draw a solid outline of 2px or more. */
async function expectFocusRing(page: Page): Promise<void> {
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => {
    let el: Element | null = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: Number.parseFloat(s.outlineWidth) };
  });
  expect(ring?.style).toBe('solid');
  expect(ring?.width).toBeGreaterThanOrEqual(2);
}

test('options: picked states and keyboard focus keep a visible cue', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-advanced').click();
  const selectedTab = page.locator('[role="tab"][aria-selected="true"]').first();
  const checkedTheme = page.locator('[data-ega-theme-toggle] [role="radio"][aria-checked="true"]');
  // Positive control: without forced colors the cue is the tint, not an outline.
  expect(await outlineOf(selectedTab)).not.toBe('solid 2px');

  await forceColors(page);
  expect(await outlineOf(selectedTab)).toBe('solid 2px');
  expect(await outlineOf(checkedTheme)).toBe('solid 2px');
  await expectFocusRing(page);
});

test('popup: keyboard focus keeps a ring, and a disabled button is greyed by color, not faded', async () => {
  await seedSettings(ext.context, ext.extensionId, { pickerEnabled: false });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  // Blocked while the picker is off in Settings.
  const swap = page.getByRole('button', { name: /^Pick element/ });
  await expect(swap).toHaveAttribute('aria-disabled', 'true');
  const opacity = (): Promise<string> => swap.evaluate((n) => getComputedStyle(n).opacity);
  // The row stays focusable, so it is greyed with the disabled color: opacity would fade its focus ring too.
  expect(await opacity()).toBe('1');
  const disabledFg = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-fg-disabled)';
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  expect(await swap.evaluate((n) => getComputedStyle(n).color)).toBe(disabledFg);
  await forceColors(page);
  expect(await opacity()).toBe('1');
  await expectFocusRing(page);
});

test('popup: the site switch shows on and off apart, with a visible thumb either way', async () => {
  const page = await ext.context.newPage();
  await page.addInitScript(() => {
    chrome.tabs.query = (async () => [
      { id: 7, url: 'https://example.com/', windowId: 1 },
    ]) as unknown as typeof chrome.tabs.query;
    chrome.tabs.sendMessage = (async () => ({
      text: '',
    })) as unknown as typeof chrome.tabs.sendMessage;
  });
  await page.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  const sw = page.getByRole('switch', { name: 'Ega on example.com' });
  await expect(sw).toBeChecked();
  await forceColors(page);
  const look = (): Promise<{ track: string; thumb: string; at: string }> =>
    sw.evaluate((n) => ({
      track: getComputedStyle(n).backgroundColor,
      thumb: getComputedStyle(n, '::after').backgroundColor,
      at: getComputedStyle(n, '::after').transform,
    }));
  const on = await look();
  expect(on.thumb).not.toBe(on.track);
  await sw.click();
  await expect(sw).not.toBeChecked();
  const off = await look();
  expect(off.thumb).not.toBe(off.track);
  // Not by colour alone: the thumb sits at the other end.
  expect(off.at).not.toBe(on.at);
  expect(off.track).not.toBe(on.track);
});

test('side panel: the streaming skeleton bar keeps a border', async () => {
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'sk-test', streaming: true });
  mockAnthropic(ext.context, { translation: 'Hello', delayMs: 3_000 });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await forceColors(page);
  await expectFocusRing(page);
  await page.locator('#sp-text').fill('hola');
  await page.locator('#sp-text').press('Enter');
  // Three bars stand in for the text; each draws its own border.
  const bar = page.locator('.ega-skeleton-bar').first();
  await bar.waitFor();
  // The gradient is gone in this mode, so the border is all that draws the bar.
  expect(
    await bar.evaluate((n) => {
      const s = getComputedStyle(n);
      return `${s.borderTopStyle} ${s.borderTopWidth}`;
    }),
  ).toBe('solid 1px');
});

/** A system color as this page resolves it: Chromium maps the keyword to the mode's palette only while forced colors are active. */
async function systemColor(page: Page, keyword: string): Promise<string> {
  return page.evaluate((k) => {
    const probe = document.createElement('span');
    probe.style.color = k;
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, keyword);
}

/** An edge a mark draws, as the style engine computes it: `style width color`. */
const barOf = (el: Locator, pseudo: '::before' | null = null): Promise<string> =>
  el.evaluate((n, p) => {
    const s = getComputedStyle(n, p);
    return `${s.borderInlineStartStyle} ${s.borderInlineStartWidth} ${s.borderInlineStartColor}`;
  }, pseudo);

/** A ring a mark draws: `style width color`. */
const ringOf = (el: Locator): Promise<string> =>
  el.evaluate((n) => {
    const s = getComputedStyle(n);
    return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`;
  });

test('side panel Ask: the target bar, quote bar, pressed Ask, banner chip and reveal flash stay visible', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    cacheEnabled: false,
  });
  mockAnthropic(ext.context, { translation: 'Hi, how are you?', times: 1 });
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sendFromPanel(page, 'mar7aba, kifak?');
  const first = page.locator('[data-ega-reply]').first();
  await expect(first.locator('.ega-answer')).toContainText('Hi, how are you?', { timeout: 10_000 });
  await first.locator('[data-ega-action="ask"]').click();
  // Registered later, so it answers the next call; the first mock is spent.
  mockAnthropic(ext.context, {
    rawText: JSON.stringify({ translation: 'Because of kifak.' }),
    times: 1,
  });
  await sendFromPanel(page, 'what makes it Levantine?');
  const last = page.locator('[data-ega-reply]').last();
  await expect(last.locator('.ega-answer')).toContainText('Because of kifak.', {
    timeout: 10_000,
  });
  // The answer is the target now, and the question above it quotes the first reply.
  await expect(last).toHaveAttribute('data-ega-ask-target', '');
  const quote = page.locator('[data-ega-ask-quote]');
  const pressed = last.locator('[data-ega-action="ask"]');
  await expect(pressed).toHaveAttribute('aria-pressed', 'true');
  const banner = page.locator('[data-ega-mode-banner]');
  await expect(banner).toBeVisible();

  // The flash lasts 1.2 s. The blur drops any focus ring, so only the flash can draw; the wait lets the 0.01 ms transition of reduced motion land.
  const flashRing = async (): Promise<string> => {
    const read = first.evaluate(
      (el) =>
        new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('the reply never flashed')), 4_000);
          const done = (): void => {
            clearTimeout(timer);
            obs.disconnect();
            (el as HTMLElement).blur();
            setTimeout(() => {
              if (!el.classList.contains('flash'))
                return reject(new Error('the flash ended first'));
              const s = getComputedStyle(el);
              resolve(`${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`);
            }, 100);
          };
          const obs = new MutationObserver(() => el.classList.contains('flash') && done());
          obs.observe(el, { attributes: true, attributeFilter: ['class'] });
          if (el.classList.contains('flash')) done();
        }),
    );
    await quote.click();
    const ring = await read;
    await expect(first).not.toHaveClass(/flash/);
    return ring;
  };

  // Positive control: without the mode the bars are the accent color, and no outline marks the chip, the pressed button or the flash.
  const accent = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-accent)';
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
  expect(await barOf(last, '::before')).toBe(`solid 2px ${accent}`);
  expect(await barOf(quote)).toBe(`solid 2px ${accent}`);
  expect(await ringOf(pressed)).toMatch(/^none /);
  expect(await ringOf(banner)).toMatch(/^none /);
  expect(await flashRing()).toMatch(/^none /);

  // The pointer stays on the quote after its click, and the mode draws a hovered button with a Highlight border of its own.
  await page.mouse.move(0, 0);
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  const highlight = await systemColor(page, 'Highlight');
  expect(highlight).not.toBe(await systemColor(page, 'Canvas'));
  // The forced-colors restyle can land a frame after emulateMedia resolves, so each read waits for it.
  await expect
    .poll(() => barOf(last, '::before'), { message: 'target bar' })
    .toBe(`solid 2px ${highlight}`);
  await expect.poll(() => barOf(quote), { message: 'quote bar' }).toBe(`solid 2px ${highlight}`);
  await expect
    .poll(() => ringOf(pressed), { message: 'pressed Ask' })
    .toBe(`solid 2px ${highlight}`);
  await expect
    .poll(() => ringOf(banner), { message: 'banner chip' })
    .toBe(`solid 1px ${highlight}`);
  // Both motion settings: neither the reduced-motion rule nor the keyframes may decide whether the flash shows.
  for (const reducedMotion of ['reduce', 'no-preference'] as const) {
    await page.emulateMedia({ forcedColors: 'active', reducedMotion });
    await expect
      .poll(() => flashRing(), { message: `reveal flash, motion ${reducedMotion}` })
      .toBe(`solid 2px ${highlight}`);
  }
});

test('tooltip: the loading shimmer keeps a border inside the shadow root', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
  });
  mockAnthropic(ext.context, { translation: 'Welcome', delayMs: 3_000 });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await forceColors(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  const shimmer = page.locator('.tooltip .shimmer');
  await shimmer.waitFor();
  expect(
    await shimmer.evaluate((n) => {
      const s = getComputedStyle(n);
      return `${s.borderTopStyle} ${s.borderTopWidth}`;
    }),
  ).toBe('solid 1px');
});

test('prefers-contrast more: borders switch to the 3:1 tokens', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-translate').waitFor();
  const border = (): Promise<string> =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim(),
    );
  await page.emulateMedia({ colorScheme: 'light', contrast: 'no-preference' });
  const normal = await border();
  await page.emulateMedia({ colorScheme: 'light', contrast: 'more' });
  expect(await border()).toBe('#80838d');
  expect(normal).not.toBe('#80838d');
  await page.emulateMedia({ colorScheme: 'dark', contrast: 'more' });
  expect(await border()).toBe('#696e77');
});

test('picker: the dimmer stays see-through and the hover outline stays visible', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    pickerEnabled: true,
    pickerShortcut: 'Ctrl+Shift+E',
  });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);
  await forceColors(page);
  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');
  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false)
    .toBe(true);
  await page.locator('#pick-me').hover();
  await expect
    .poll(async () => (await egaTest<number>(page, 'pickerOutlineCount')) ?? 0)
    .toBeGreaterThanOrEqual(1);

  const drawn = await page.evaluate(() => {
    const root = document.querySelector('#ega-shadow-host')?.shadowRoot;
    const dimmer = root?.querySelector('.picker-dimmer');
    const outline = root?.querySelector('[data-ega-picker-outline]');
    if (!dimmer || !outline) return null;
    const d = getComputedStyle(dimmer);
    const o = getComputedStyle(outline);
    return {
      dimmerBg: d.backgroundColor,
      border: `${o.borderTopStyle} ${o.borderTopWidth}`,
      borderColor: o.borderTopColor,
    };
  });
  expect(drawn).not.toBeNull();
  // An opaque dimmer would hide the very page the user is picking from.
  const alpha = /rgba\([^)]*,\s*([\d.]+)\)/.exec(drawn?.dimmerBg ?? '')?.[1];
  expect(alpha === undefined ? 1 : Number(alpha)).toBeLessThan(1);
  expect(drawn?.border).toBe('solid 2px');
  expect(drawn?.borderColor).not.toBe('rgba(0, 0, 0, 0)');
});
