import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
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
