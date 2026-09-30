import { test, expect, type Page, type BrowserContext, type Route } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  sendImageTranslatePending,
  sendImageTranslateResult,
  waitForTestHooks,
  type ExtensionHandle,
  pickAreasAndTranslate,
  resetRoutes,
} from './helpers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPaths } from '../../scripts/visual-judge/config';
import type { ShotMeta } from '../../scripts/visual-judge/judge/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { currentDir: CURRENT_DIR, metaDir: META_DIR } = buildPaths(
  path.resolve(__dirname, '..', '..'),
);
/** What Chrome actually gives the side panel; the 1200px launch canvas hides wrapping and overflow. */
const NARROW_SIDEPANEL = { width: 380, height: 760 };

// Run via `pnpm visual:capture`; every shot costs judge tokens, so each one added lengthens `pnpm visual:judge`.

let ext: ExtensionHandle;

test.beforeAll(async () => {
  fs.mkdirSync(CURRENT_DIR, { recursive: true });
  fs.mkdirSync(META_DIR, { recursive: true });
  ext = await launchExtension();
});

// Chromium freezes background tabs once enough pile up, and a frozen tab answers no CDP call.
test.afterEach(async () => {
  for (const page of ext.context.pages().slice(1)) {
    await page.close().catch(() => undefined);
  }
});

test.afterAll(async () => {
  await ext.close();
});

// Per-origin threads persist across tests in this shared context, so a late-mounted panel inherits a sibling test's turns.
async function clearConversations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith('ega:conv:'));
    if (keys.length > 0) await chrome.storage.local.remove(keys);
  });
  await page.reload();
}

// The headless mouse can default onto a nav-rail row and bake its hover tooltip into the shot.
async function parkCursor(page: Page): Promise<void> {
  await page.mouse.move(0, 900);
  await page.waitForTimeout(50); // wait for CSS transition (no observable end state)
}

/** Writes the shot plus its `meta.json`; `surface` must name a rubric under `audit/rubric/`, or `unknown`. */
async function shot(
  page: Page,
  name: string,
  meta: Omit<ShotMeta, 'name'> = { surface: 'unknown', state: 'default' },
  opts: { skipPark?: boolean } = {},
): Promise<void> {
  // Picker shots skip this: the picker repaints its outline on every mousemove, so parking would re-outline (0, 900).
  if (!opts.skipPark) await parkCursor(page);
  // Resize before capture so popup shots stamp the real 380x600 chrome, not the 1200x800 launch canvas.
  if (meta.viewport) {
    await page.setViewportSize(meta.viewport);
    await page.waitForTimeout(80); // wait for layout reflow + popover position recompute (no observable end state)
  }
  // Scroll to top, or `fullPage` stamps `position: fixed` overlays at the current scroll offset instead of y=0.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(50); // wait for fixed overlays to repaint at y=0 (no observable end state)
  const currentFile = path.join(CURRENT_DIR, `${name}.png`);
  await page.screenshot({ path: currentFile, fullPage: true });
  const sidecar: ShotMeta = { name, ...meta };
  fs.writeFileSync(path.join(META_DIR, `${name}.meta.json`), JSON.stringify(sidecar, null, 2));
}

/** Sets `data-theme` on the page as well as in settings — the storage `onChanged` subscriber can lose the race with the capture. */
async function applyThemeOnPage(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((t) => {
    document.documentElement.dataset['theme'] = t;
    // Drives native form chrome on fixtures that carry no [data-theme=dark] rules of their own.
    document.documentElement.style.colorScheme = t;
  }, theme);
  await page.waitForTimeout(150); // wait for CSS custom-property cascade repaint (no observable end state)
}

/** Points the active tab at an http(s) fixture, or the popup's `siteHost` stays null and the per-site button never renders. */
async function openFixtureTab(context: BrowserContext, serverUrl: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${serverUrl}/selection-page.html`);
  await page.waitForLoadState('networkidle');
  return page;
}

test('Advanced — every chip + sub-tab + key modal', async () => {
  // ~22 captures + slot-hover wait. Bigger than 30s budget.
  test.slow();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');

  await page.locator('[role="tab"]:has-text("Advanced")').first().click();
  await page.waitForTimeout(400); // wait for tab panel CSS transition (no observable end state)
  await shot(page, '00-advanced-landing', {
    surface: 'options',
    state: 'landing',
    theme: 'light',
    userAction: 'user opened Options shell and clicked the Advanced top-tab',
    expectations: [
      'Advanced tab is selected in the top tab strip',
      'Advanced sub-tab strip (Diagnostics / Data / Labs) is rendered with Diagnostics active',
      'left nav rail is visible',
    ],
  });

  const subTab = (id: string): ReturnType<Page['locator']> =>
    page.locator(`[data-ega-subtab="${id}"]`).first();
  const chip = (id: string): ReturnType<Page['locator']> =>
    page.locator(`[data-ega-workbench-chip="${id}"]`).first();

  // The chip strip lives on the Templates tab, not Advanced.
  await page.locator('[role="tab"]:has-text("Templates")').first().click();
  await page.waitForTimeout(400); // wait for tab panel CSS transition (no observable end state)

  const chips = [
    'global',
    'translate',
    'explain',
    'summarize',
    'reword',
    'grammar',
    'suggest-replies',
    'per-preset',
    'per-site',
    'snippets',
    'rules',
    'recipes',
  ];
  for (const id of chips) {
    const target = chip(id);
    if ((await target.count()) === 0) continue;
    await target.click();
    await page.waitForTimeout(300); // wait for chip workbench mount animation (no observable end state)
    await shot(page, `templates-${id}`, {
      surface: 'templates',
      state: `chip-${id}`,
      theme: 'light',
      userAction: `user clicked the ${id} chip on the Templates workbench`,
      expectations: [
        `${id} editor mounts beneath the chip strip`,
        'no native primitives leaked into the editor frame',
      ],
    });
  }

  // Sub-tabs are back on Advanced.
  await page.locator('[role="tab"]:has-text("Advanced")').first().click();
  await page.waitForTimeout(400); // wait for tab panel CSS transition (no observable end state)

  for (const id of ['diagnostics', 'data', 'labs']) {
    const target = subTab(id);
    if ((await target.count()) === 0) continue;
    await target.click();
    await page.waitForTimeout(400); // wait for sub-tab panel mount animation (no observable end state)
    await shot(page, `subtab-${id}`, {
      surface: 'options',
      state: `subtab-${id}`,
      theme: 'light',
      userAction: `user clicked the ${id} sub-tab on the Advanced workbench`,
      expectations: [`${id} surface mounts with its primary content visible`],
    });
  }

  // Settings search modal (Cmd+,)
  await subTab('diagnostics').click();
  await page.waitForTimeout(200); // wait for sub-tab transition (no observable end state)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,');
  await page.waitForTimeout(300); // wait for modal mount animation (no observable end state)
  await shot(page, 'settings-search-empty', {
    surface: 'options',
    state: 'settings-search-empty',
    theme: 'light',
    userAction: 'user pressed Cmd+, / Ctrl+, to open the settings-search modal',
    expectations: ['search modal is focused', 'input is empty', 'no results pane drawn yet'],
  });
  await page.keyboard.type('temperature');
  await page.waitForTimeout(200); // wait for fuzzy-search debounce (250ms input debounce)
  await shot(page, 'settings-search-temperature', {
    surface: 'options',
    state: 'settings-search-temperature',
    theme: 'light',
    userAction: 'user typed "temperature" into the settings-search input',
    expectations: [
      'result row for the Temperature control visible',
      'fuzzy match highlights legible',
    ],
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150); // wait for modal dismiss animation (no observable end state)

  // Slot palette + raw template visible (Global chip)
  await page.locator('[role="tab"]:has-text("Templates")').first().click();
  await page.waitForTimeout(400); // wait for tab panel CSS transition (no observable end state)
  await chip('global').click();
  await page.waitForTimeout(300); // wait for chip workbench mount animation (no observable end state)
  await shot(page, 'templates-global-detail', {
    surface: 'templates',
    state: 'global-detail',
    theme: 'light',
    userAction: 'user opened the Global chip and saw the slot palette + raw template',
    expectations: ['slot palette visible', 'editor visible below', 'no overflow'],
  });

  // bits-ui opens on a real pointerenter, and `.hover()` can mount the portal after the screenshot fires.
  const slotChip = page.locator('[data-ega-slot-chip]').first();
  if ((await slotChip.count()) > 0) {
    await slotChip.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100); // wait for any prior hover tooltip dismiss animation (no observable end state)
    await slotChip.evaluate((el) => {
      const target = el as HTMLElement;
      const rect = target.getBoundingClientRect();
      const init = {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        pointerType: 'mouse',
      };
      target.dispatchEvent(new PointerEvent('pointerover', init));
      target.dispatchEvent(new PointerEvent('pointerenter', init));
      target.dispatchEvent(new MouseEvent('mouseover', init));
      target.dispatchEvent(new MouseEvent('mouseenter', init));
    });
    await page
      .locator('[role="tooltip"]:visible')
      .first()
      .waitFor({ state: 'visible', timeout: 3_000 })
      .catch(() => undefined);
    await page.waitForTimeout(250); // wait for tooltip fade-in animation to complete (no observable end state)
    await shot(page, 'templates-global-slot-hover', {
      surface: 'templates',
      state: 'global-slot-hover',
      theme: 'light',
      userAction: 'user hovered a slot pill in the palette to read its registry description',
      expectations: [
        'registry tooltip near the hovered slot pill',
        'tooltip text legible',
        'tooltip does NOT clip surrounding pills illegibly',
      ],
    });
    await slotChip.evaluate((el) => {
      const target = el as HTMLElement;
      target.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200); // wait for tooltip dismiss animation (no observable end state)
  }

  // Click the [+ Insert variable] command picker
  const insertButton = page.locator('button:has-text("Insert variable")').first();
  if ((await insertButton.count()) > 0) {
    await insertButton.click();
    await page.waitForTimeout(600); // wait for popover mount + position recompute (no observable end state)
    await shot(page, 'templates-global-insert-variable', {
      surface: 'templates',
      state: 'insert-variable-open',
      theme: 'light',
      userAction: 'user clicked the [+ Insert variable] command picker',
      expectations: [
        'variable picker popover anchors to the trigger button',
        'popover does NOT cover the slot palette chips above',
        'search input focused',
      ],
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200); // wait for popover dismiss animation (no observable end state)
  }

  // Rules chip — empty + add a rule
  await chip('rules').click();
  await page.waitForTimeout(300); // wait for chip workbench mount animation (no observable end state)
  await shot(page, 'templates-rules-empty', {
    surface: 'templates',
    state: 'rules-empty',
    theme: 'light',
    userAction: 'user opened the Rules chip with no rules defined',
    expectations: ['empty-state CTA visible', 'explanation copy legible', 'no bare empty pane'],
  });

  // Recipes chip
  await chip('recipes').click();
  await page.waitForTimeout(300); // wait for chip workbench mount animation (no observable end state)
  await shot(page, 'templates-recipes', {
    surface: 'templates',
    state: 'recipes',
    theme: 'light',
    userAction: 'user opened the Recipes chip to browse bundled prompt recipes',
    expectations: [
      'recipe cards visible',
      'task-filter chip strip visible',
      'primary action on each card distinguishable from secondary',
    ],
  });

  // No assertion: the PNGs above are the output, and `pnpm visual:judge` reads them.
});

test('Options — all top-level tabs (light + dark sampling)', async () => {
  test.slow();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');

  const tabs = ['translate', 'selection-bubble', 'backends', 'languages', 'templates', 'about'];
  for (const id of tabs) {
    const target = page.locator(`#tab-${id}`);
    if ((await target.count()) === 0) continue;
    await target.click();
    await page.waitForTimeout(400); // wait for tab panel mount animation (no observable end state)
    await shot(page, `options-${id}`, {
      surface: 'options',
      state: id,
      theme: 'light',
      userAction: `user opened the ${id} options tab`,
      expectations: ['tab content mounts', 'left nav rail visible', 'no overflow'],
    });
  }

  for (const id of [
    'translate',
    'selection-bubble',
    'backends',
    'languages',
    'templates',
    'about',
  ]) {
    const target = page.locator(`#tab-${id}`);
    if ((await target.count()) === 0) continue;
    await target.click();
    await applyThemeOnPage(page, 'dark');
    await shot(page, `options-${id}-dark`, {
      surface: 'options',
      state: id,
      theme: 'dark',
      userAction: `user opened the ${id} options tab in dark theme`,
      expectations: [
        'tab content mounts',
        'tokens shift to dark surface palette',
        'parity with light variant in structure',
      ],
    });
    await applyThemeOnPage(page, 'light');
  }
});

// The popup hides its site button on a chrome:// tab, so each test opens a fixture-origin tab first.
test('Popup — default + popover + palette + shortcuts + mid-flight + dark', async () => {
  // ~7 shots + a mid-flight wait + a fresh tab; well past the 30s default.
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
  });
  // Ensure the active tab points at a fixture origin so per-site button mounts.
  await openFixtureTab(ext.context, ext.serverUrl);

  // Default
  const popup = await ext.context.newPage();
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await popup.waitForLoadState('networkidle');
  await popup.waitForTimeout(500); // wait for SW context initialization + Svelte mount settle (no observable end state)
  await shot(popup, 'popup-default', {
    surface: 'popup',
    state: 'default',
    theme: 'light',
    userAction: 'user clicked the toolbar action button to open the popup',
    expectations: [
      'four trigger tiles (Page / Pick / Clipboard / Panel) form the visual focus',
      'lang pair (source + target + swap) visible above the grid',
      'collapsed "Translate something…" entry reachable below the grid',
      'header carries the brand mark, the theme toggle and the Options gear',
      'no Toaster / StatusPill leaked',
    ],
    viewport: { width: 380, height: 600 },
  });

  // Dark-theme default
  const popupDark = await ext.context.newPage();
  await popupDark.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await popupDark.waitForLoadState('networkidle');
  await applyThemeOnPage(popupDark, 'dark');
  await shot(popupDark, 'popup-default-dark', {
    surface: 'popup',
    state: 'default',
    theme: 'dark',
    userAction: 'user opened the popup with dark theme active',
    expectations: [
      'four trigger tiles render in dark surface tokens',
      'lang pair primitives honor dark theme',
      'parity with light variant in structure',
    ],
    viewport: { width: 380, height: 600 },
  });
});

test('Sidepanel — empty + streaming + multi-turn + refine + error + popover + dark', async () => {
  // 8 shots + two real translates + an error retry path. Easily past 30s.
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
  });

  // Empty
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.waitForLoadState('networkidle');
  await sp.waitForTimeout(500); // wait for SW context initialization + Svelte mount settle (no observable end state)
  await shot(sp, 'sidepanel-empty', {
    surface: 'sidepanel',
    state: 'empty',
    theme: 'light',
    userAction: 'user opened the side panel without any prior conversation',
    expectations: ['empty-state CTA visible', 'input footer reachable', 'no orphan widgets'],
  });
  // A real Chrome side panel is ~380px wide; the 1200px canvas hides header wrapping and strip overflow.
  await shot(sp, 'sidepanel-narrow-empty', {
    surface: 'sidepanel',
    state: 'empty',
    theme: 'light',
    viewport: NARROW_SIDEPANEL,
    userAction: 'user opened the side panel at its real width with no prior conversation',
    expectations: ['header wraps without clipping', 'shortcut hints fit', 'no horizontal scroll'],
  });
  await sp.setViewportSize({ width: 1200, height: 800 });

  // `times: 1` unregisters after this turn, so the second translate below installs a clean mock.
  const streamingMock = mockAnthropic(ext.context, {
    translation: 'Hello, friend.',
    delayMs: 1500,
    times: 1,
  });
  await sp.locator('#sp-text').fill('hola');
  await sp.getByRole('button', { name: /^Translate$/ }).click();
  // Intentional pause inside the SSE hold window so the streaming cursor is on screen.
  await sp.waitForTimeout(600); // wait for mid-flight streaming state (no observable "mid-stream" DOM condition)
  await shot(sp, 'sidepanel-streaming', {
    surface: 'sidepanel',
    state: 'streaming',
    theme: 'light',
    userAction: 'user submitted text; capture mid-stream while SSE is held',
    expectations: [
      'assistant turn shows shimmer skeleton OR blinking cursor',
      'input footer remains visible',
      'no broken-render rectangle',
    ],
  });
  // Wait for the skeleton to detach: it has no .ega-cursor and sits inside .ega-assistant-body.
  await sp.locator('.ega-stream-skeleton').waitFor({ state: 'detached', timeout: 20_000 });
  await sp.waitForTimeout(400); // wait for post-stream CSS transition + chip strip mount (no observable end state)
  await shot(sp, 'sidepanel-first-turn-done', {
    surface: 'sidepanel',
    state: 'first-turn-done',
    theme: 'light',
    userAction: 'first translation finished streaming; convo shows one user + one assistant turn',
    expectations: ['assistant body filled', 'no in-flight cursor', 'quick-refine chips visible'],
  });

  // Unconditional on purpose: a capture behind `isVisible()` skipped silently for
  // months while the shot's own sidecar kept declaring the chips.
  await sp
    .locator('[data-ega-refine-chip="shorter"]')
    .waitFor({ state: 'visible', timeout: 10_000 });
  await shot(sp, 'sidepanel-quick-refine', {
    surface: 'sidepanel',
    state: 'quick-refine',
    theme: 'light',
    userAction: 'first translation done; quick-refine chip strip visible',
    expectations: ['chips render with legible labels', 'chip row sits beneath the assistant turn'],
  });

  // `times: 1` again so the 401 route registered further down cannot fight a stale handler.
  streamingMock.reset();
  mockAnthropic(ext.context, { translation: 'Hi there.', times: 1 });
  await sp.locator('#sp-text').fill('como estas');
  await sp.getByRole('button', { name: /^Translate$/ }).click();
  await sp
    .locator('.ega-assistant-body')
    .nth(1)
    .waitFor({ state: 'visible', timeout: 10_000 })
    .catch(() => undefined);
  await sp.waitForTimeout(400); // wait for post-stream CSS transition + quick-refine chip render (no observable end state)
  await shot(sp, 'sidepanel-multi-turn', {
    surface: 'sidepanel',
    state: 'multi-turn',
    theme: 'light',
    userAction: 'user submitted a second turn after the first; convo shows two pairs',
    expectations: [
      'two user + two assistant turns visible stacked',
      'prior turn content NOT collapsed',
      'latest turn at the bottom',
    ],
  });

  const chip = sp.locator('.active-backend-chip');
  if ((await chip.count()) > 0) {
    await chip.click();
    await sp.waitForTimeout(400); // wait for popover mount + position recompute (no observable end state)
    await shot(sp, 'sidepanel-backend-popover', {
      surface: 'sidepanel',
      state: 'backend-popover',
      theme: 'light',
      userAction: 'user clicked the active-backend chip to inspect chain detail',
      expectations: [
        'popover anchored near chip',
        'scrim covers chrome uniformly',
        'pinned backend marked',
        'read-only popover hides the pin Select (Manage button only)',
      ],
    });
    // Escape here left the popover open and it leaked into every later shot; close it and prove it is gone.
    await sp.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(sp.getByRole('dialog')).toHaveCount(0);
    await sp.waitForTimeout(200); // wait for popover dismiss animation (no observable end state)
  }

  // Dark theme of multi-turn state
  await applyThemeOnPage(sp, 'dark');
  await shot(sp, 'sidepanel-multi-turn-dark', {
    surface: 'sidepanel',
    state: 'multi-turn',
    theme: 'dark',
    userAction: 'multi-turn conversation in dark theme',
    expectations: [
      'parity with multi-turn light variant in structure',
      'dark surface tokens applied',
      'assistant body text legible against dark bg',
    ],
  });
  await shot(sp, 'sidepanel-narrow-multi-turn-dark', {
    surface: 'sidepanel',
    state: 'multi-turn',
    theme: 'dark',
    viewport: NARROW_SIDEPANEL,
    userAction: 'multi-turn conversation in dark theme at side-panel width',
    expectations: [
      'turn actions fit on one row',
      'task strip overflow is signposted',
      'no clipped text',
    ],
  });
  await applyThemeOnPage(sp, 'light');
  await shot(sp, 'sidepanel-narrow-multi-turn', {
    surface: 'sidepanel',
    state: 'multi-turn',
    theme: 'light',
    viewport: NARROW_SIDEPANEL,
    userAction: 'multi-turn conversation at side-panel width',
    expectations: [
      'header wraps without clipping',
      'task strip overflow is signposted',
      'no horizontal scroll',
    ],
  });

  // The 401 route takes no `times`, or a retry falls through to a stale 200.
  await resetRoutes(ext.context, 'wait');
  // Cache off, or the earlier turn's cached result short-circuits the 401; native off, or the chain rotates past anthropic and hangs.
  await seedSettings(ext.context, ext.extensionId, {
    cacheEnabled: false,
    disabledBackends: ['native'],
  });
  const handle401 = async (route: Route): Promise<void> => {
    await route.fulfill({
      status: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { type: 'authentication_error', message: 'bad key' } }),
    });
  };
  await ext.context.route('https://api.anthropic.com/v1/messages', handle401);
  const spErr = await ext.context.newPage();
  await spErr.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await spErr.waitForLoadState('networkidle');
  await spErr.waitForTimeout(300); // wait for SW context initialization + Svelte mount settle (no observable end state)
  // A fresh input string, so the request body diverges even if `cacheEnabled` flips late.
  await spErr.locator('#sp-text').fill('test 401 path');
  await spErr.getByRole('button', { name: /^Translate$/ }).click();
  // No `.catch()` here — silencing this lets a success-state capture ship under the error-state name.
  await spErr.locator('.ega-assistant-error').waitFor({ state: 'visible', timeout: 10_000 });
  await spErr.waitForTimeout(300); // wait for error block CSS entrance animation (no observable end state)
  await expect(spErr.locator('.ega-retry-btn')).toHaveCount(0);
  await expect(spErr.locator('[data-ega-sidepanel-open-options]')).toBeVisible();
  await shot(spErr, 'sidepanel-error-state', {
    surface: 'sidepanel',
    state: 'error-state',
    theme: 'light',
    userAction: 'user submitted a turn; backend returned 401 — assistant turn shows error',
    expectations: [
      'inline error block visible inside the assistant turn',
      'NO Retry button — AUTH is terminal, retrying the same key cannot succeed',
      '"Open settings" action reachable instead',
      'error tone token applied (danger family)',
    ],
  });
  await shot(spErr, 'sidepanel-narrow-error-state', {
    surface: 'sidepanel',
    state: 'error-state',
    theme: 'light',
    viewport: NARROW_SIDEPANEL,
    userAction: 'same 401 error turn at side-panel width',
    expectations: ['error block wraps inside the turn', '"Open settings" stays reachable'],
  });
  await ext.context.unroute('https://api.anthropic.com/v1/messages', handle401);
});

// The tooltip lives in a page shadow host, so `fullPage: true` captures it; states are split across tests to fit the per-test budget.
const TOOLTIP_SEED = {
  anthropicApiKey: 'test-key',
  streaming: true,
  shortcut: 'Ctrl+Shift+L',
  tooltipClickOutside: false,
  confidencePill: true,
  captureResultMeta: true,
  contextEnabled: true,
  pageContextLevel: 'minimal' as const,
  imageTranslateSurface: 'tooltip' as const,
  // `seedSettings` merges, so pin this: page-translate shots flip it to 'inline', which tears the tooltip's anchor rect.
  defaultDisplayMode: 'tooltip' as const,
  // 'never' bypasses the smart branch that raises the upgrade banner over the tooltip.
  bubbleMode: 'never' as const,
  smartBubbleBannerShown: true,
};

/** Never `.catch()` the `waitForFunction` below — a silent timeout ships a PNG with no tooltip in frame. */
async function landTooltipBody(page: Page, expectIn: string, timeoutMs = 10_000): Promise<void> {
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  await page.waitForFunction(
    (needle) => {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      const body = root?.querySelector('.tooltip .body');
      return !!body && body.textContent.includes(needle);
    },
    expectIn,
    { timeout: timeoutMs, polling: 250 },
  );
  await page.waitForTimeout(250); // wait for tooltip entrance animation to complete (no observable end state)
}

test('Tooltip — default + inspector + context preview', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, TOOLTIP_SEED);
  await resetRoutes(ext.context);
  mockAnthropic(ext.context, { translation: 'Welcome! How are you doing?', confidence: 0.92 });
  const page = await ext.context.newPage();
  await landTooltipBody(page, 'Welcome');
  await shot(page, 'tooltip-default', {
    surface: 'tooltip',
    state: 'default',
    theme: 'light',
    userAction: 'user selected arabizi text and pressed Ctrl+Shift+L; tooltip mounts on the page',
    expectations: [
      'tooltip anchored near the selection (overlap with selection-adjacent text is expected)',
      'translation body rendered',
      'confidence pill inside the card radius',
    ],
  });

  // Inspector drawer on the same tooltip.
  await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const btn = root?.querySelector<HTMLButtonElement>(
      '.tooltip button[aria-label="Show inspector"]',
    );
    btn?.click();
  });
  await page.waitForTimeout(400); // wait for inspector drawer slide-in animation (no observable end state)
  await shot(page, 'tooltip-inspector-open', {
    surface: 'tooltip',
    state: 'inspector-open',
    theme: 'light',
    userAction: 'user clicked the inspector affordance on the tooltip topbar',
    expectations: ['inspector drawer mounts below the body', 'ResultMeta fields visible'],
  });

  // Toggle context preview open.
  await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const btn = root?.querySelector<HTMLButtonElement>(
      '.tooltip button[aria-label="Show what was sent"]',
    );
    btn?.click();
  });
  await page.waitForTimeout(400); // wait for context-preview expand animation (no observable end state)
  await shot(page, 'tooltip-context-preview', {
    surface: 'tooltip',
    state: 'context-preview',
    theme: 'light',
    userAction: 'user expanded the context-preview affordance',
    expectations: ['context block visible in footer', 'block readable but compact'],
  });
  await page.close();
});

test('Tooltip — loading + error', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, TOOLTIP_SEED);

  // 2s holds the shimmer long enough for the poll plus the screenshot.
  await resetRoutes(ext.context);
  mockAnthropic(ext.context, { translation: 'Welcome! How are you doing?', delayMs: 2000 });
  const loadingPage = await ext.context.newPage();
  await loadingPage.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(loadingPage);
  await loadingPage.locator('body').focus();
  await selectArabiziParagraph(loadingPage);
  await loadingPage.keyboard.press('Control+Shift+L');
  await loadingPage
    .waitForFunction(
      () => {
        const host = document.querySelector('#ega-shadow-host');
        const root = (host as HTMLElement | null)?.shadowRoot;
        return !!root?.querySelector('.tooltip .shimmer');
      },
      { timeout: 5_000, polling: 250 },
    )
    .catch(() => undefined);
  await shot(loadingPage, 'tooltip-loading', {
    surface: 'tooltip',
    state: 'loading',
    theme: 'light',
    userAction: 'user triggered translate; capture while SSE is held (shimmer phase)',
    expectations: ['shimmer where the body would be', 'topbar still legible'],
  });
  await loadingPage.close();

  // Error path — 500 from the route, [data-ega-retry] should mount.
  await resetRoutes(ext.context);
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await route.fulfill({
      status: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { type: 'api_error', message: 'upstream exploded' } }),
    });
  });
  const errPage = await ext.context.newPage();
  await errPage.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(errPage);
  await errPage.locator('body').focus();
  await selectArabiziParagraph(errPage);
  await errPage.keyboard.press('Control+Shift+L');
  await errPage
    .waitForFunction(
      () => {
        const host = document.querySelector('#ega-shadow-host');
        const root = (host as HTMLElement | null)?.shadowRoot;
        return !!root?.querySelector('.tooltip [data-ega-retry]');
      },
      { timeout: 10_000, polling: 250 },
    )
    .catch(() => undefined);
  await errPage.waitForTimeout(300); // wait for error block CSS entrance animation (no observable end state)
  await shot(errPage, 'tooltip-error', {
    surface: 'tooltip',
    state: 'error',
    theme: 'light',
    userAction: 'backend returned 500; tooltip shows error body + retry',
    expectations: ['error message replaces body', 'retry button reachable'],
  });
  await errPage.close();
  await resetRoutes(ext.context);
});

test('Tooltip — multi-variety cluster', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, TOOLTIP_SEED);

  const payload = JSON.stringify({
    translation: 'Welcome',
    confidence: 0.95,
    detectedLangs: [
      { id: 'arabizi', detail: 'Levantine' },
      { id: 'en', detail: 'English' },
    ],
  });
  const mid = Math.max(1, Math.floor(payload.length / 2));
  const first = JSON.stringify(payload.slice(0, mid));
  const second = JSON.stringify(payload.slice(mid));
  const mvBody = [
    `event: message_start`,
    `data: {"type":"message_start","message":{"id":"m1","type":"message","role":"assistant","content":[]}}`,
    ``,
    `event: content_block_start`,
    `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
    ``,
    `event: content_block_delta`,
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${first}}}`,
    ``,
    `event: content_block_delta`,
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${second}}}`,
    ``,
    `event: content_block_stop`,
    `data: {"type":"content_block_stop","index":0}`,
    ``,
    `event: message_stop`,
    `data: {"type":"message_stop"}`,
    ``,
  ].join('\n');
  await resetRoutes(ext.context);
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
      body: mvBody,
    });
  });
  const mvPage = await ext.context.newPage();
  await mvPage.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(mvPage);
  await mvPage.locator('body').focus();
  await selectArabiziParagraph(mvPage);
  await mvPage.keyboard.press('Control+Shift+L');
  await mvPage
    .waitForFunction(
      () => {
        const host = document.querySelector('#ega-shadow-host');
        const root = (host as HTMLElement | null)?.shadowRoot;
        return !!root?.querySelector('.tooltip [data-ega-multi-variety]');
      },
      { timeout: 10_000, polling: 250 },
    )
    .catch(() => undefined);
  await mvPage.waitForTimeout(300); // wait for chip cluster CSS entrance animation (no observable end state)
  await shot(mvPage, 'tooltip-multi-variety', {
    surface: 'tooltip',
    state: 'multi-variety',
    theme: 'light',
    userAction: 'detector returned multiple variety candidates; tooltip shows chip cluster',
    expectations: ['chip cluster visible in body', 'each chip label legible'],
  });
  await mvPage.close();
  await resetRoutes(ext.context);
});

test('Tooltip — image-inline', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, TOOLTIP_SEED);

  const imgPage = await ext.context.newPage();
  await imgPage.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(imgPage);
  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  const imageUrl = `${ext.serverUrl}/arabizi.png`;
  const handle = await sendImageTranslatePending(opts, ext.serverUrl, imageUrl);
  await sendImageTranslateResult(opts, handle, {
    translation: 'Welcome from image',
    confidence: 0.92,
  });
  await opts.close();
  await imgPage.waitForFunction(
    () => {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      const img = root?.querySelector<HTMLImageElement>('.tooltip img.tooltip-image-source');
      return !!img && img.complete && img.naturalWidth > 1 && img.naturalHeight > 1;
    },
    { timeout: 10_000, polling: 250 },
  );
  await imgPage.waitForTimeout(300); // wait for image-inline tooltip CSS entrance animation (no observable end state)
  await shot(imgPage, 'tooltip-image-inline', {
    surface: 'tooltip',
    state: 'image-inline',
    theme: 'light',
    userAction: 'image-translate result lands; tooltip shows image header + body',
    expectations: [
      'image at top of card with natural aspect ratio',
      'body below image',
      'confidence pill INSIDE the card radius (no overflow past rounded corner)',
    ],
  });
  await imgPage.close();
});

test('Tooltip — dark theme', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, { ...TOOLTIP_SEED, theme: 'dark' });
  await resetRoutes(ext.context);
  mockAnthropic(ext.context, { translation: 'Welcome.', confidence: 0.9 });
  const darkPage = await ext.context.newPage();
  await landTooltipBody(darkPage, 'Welcome');
  await applyThemeOnPage(darkPage, 'dark');
  await darkPage.waitForTimeout(200); // wait for CSS custom-property cascade repaint on shadow content (no observable end state)
  await shot(darkPage, 'tooltip-default-dark', {
    surface: 'tooltip',
    state: 'default',
    theme: 'dark',
    userAction: 'tooltip mounts in dark theme',
    expectations: [
      'tokens shift to dark family',
      'topbar buttons still legible',
      'confidence pill inside card radius',
    ],
  });
  await darkPage.close();
  await seedSettings(ext.context, ext.extensionId, { theme: 'light' });
});

test('Smart-bubble — default + per-site disabled (negative)', async () => {
  test.slow();
  // Default
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    bubbleMode: 'always',
  });
  const bubble = await ext.context.newPage();
  await bubble.goto(`${ext.serverUrl}/smart-bubble-page.html`);
  await waitForTestHooks(bubble);
  await bubble.locator('body').focus();
  await bubble.evaluate(() => {
    const el = document.getElementById('arabizi');
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });
  await bubble
    .waitForFunction(
      () => {
        const host = document.querySelector('#ega-shadow-host');
        const root = (host as HTMLElement | null)?.shadowRoot;
        return !!root?.querySelector('.bubble');
      },
      { timeout: 5_000, polling: 250 },
    )
    .catch(() => undefined);
  await bubble.waitForTimeout(200); // wait for bubble CSS entrance animation (no observable end state)
  await shot(bubble, 'smart-bubble-default', {
    surface: 'smart-bubble',
    state: 'default',
    theme: 'light',
    userAction: 'user selected eligible arabizi text; smart bubble mounts below the selection',
    expectations: [
      'bubble visible below selection',
      'source-lang pill reads correctly',
      'bubble does NOT cover the body text immediately below the selection',
    ],
  });
  await bubble.close();

  // `sitePrefs` keys by `location.origin` (`http://127.0.0.1:PORT`), not bare hostname — a hostname key never matches.
  await seedSettings(ext.context, ext.extensionId, {
    sitePrefs: { [ext.serverUrl]: { disabled: true } },
  });
  const blocked = await ext.context.newPage();
  await blocked.goto(`${ext.serverUrl}/smart-bubble-page.html`);
  await waitForTestHooks(blocked).catch(() => undefined);
  await blocked.locator('body').focus();
  await blocked.evaluate(() => {
    const el = document.getElementById('arabizi');
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });
  await blocked.waitForTimeout(800); // wait for selectionchange debounce + content-script settle (negative check)
  await shot(blocked, 'smart-bubble-per-site-disabled', {
    surface: 'smart-bubble',
    state: 'per-site-disabled',
    theme: 'light',
    userAction:
      'per-site disabled mode active; user selected eligible text — bubble must NOT mount',
    expectations: [
      'page renders normally',
      'NO bubble visible in or around the selection',
      'no orphan overlay artifacts',
    ],
  });
  await blocked.close();
  await seedSettings(ext.context, ext.extensionId, { sitePrefs: {} });
});

test('Picker — overlay empty + hover outline', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    pickerEnabled: true,
    pickerShortcut: 'Ctrl+Shift+E',
  });
  await resetRoutes(ext.context);

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');
  // No `.catch()`: a silenced timeout here ships a bare page under the picker-overlay name.
  await page.waitForFunction(
    () => {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      return !!root?.querySelector('[data-ega-picker-wrap]');
    },
    { timeout: 5_000, polling: 250 },
  );
  // Do not move the mouse before this shot — `picker.ts` onMouseMove would outline html/body and break the "no hover" state.
  await page.waitForTimeout(200); // wait for picker overlay CSS entrance animation (no observable end state)
  await shot(
    page,
    'picker-overlay-empty',
    {
      surface: 'picker',
      state: 'overlay-empty',
      theme: 'light',
      userAction: 'user pressed Ctrl+Shift+E to enter picker mode; no hover yet',
      expectations: [
        'hint banner ("Click or use arrow keys + Enter to translate · Esc to cancel") readable at the bottom center',
        'no element outline (no hover)',
        'full-viewport dim layer covers the page — deliberate, it is what marks picker mode',
      ],
    },
    { skipPark: true },
  );

  await page.locator('#pick-me').hover();
  await page.waitForFunction(
    () => {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      const ol = root?.querySelector<HTMLElement>('.picker-outline');
      if (!ol) return false;
      const rect = ol.getBoundingClientRect();
      // The #pick-me paragraph is ~680x50; the fixture body is ~800 tall, so these bounds tell the two hovers apart.
      return rect.width < 740 && rect.height < 90 && rect.height > 0;
    },
    { timeout: 3_000, polling: 250 },
  );
  await page.waitForTimeout(200); // wait for outline repaint after rAF-gated position update (no observable end state)
  await shot(
    page,
    'picker-overlay-active',
    {
      surface: 'picker',
      state: 'overlay-active',
      theme: 'light',
      userAction: 'user hovered the pickable paragraph; outline mounts at its rect',
      expectations: [
        'outline visible around the hovered #pick-me element only',
        'outline sized to the paragraph, not the entire body',
        'hint banner still readable at top',
      ],
    },
    { skipPark: true },
  );
  await page.keyboard.press('Escape');
  await page.close();
});

// The tooltip buffers and emits at done, so the loading state is only capturable on the sidepanel; the result rides the pending-then-result pair an extension page sends, which clears the SW-as-sender guard.
test('Image-translate — sidepanel loading + tooltip result', async () => {
  test.slow();
  const imageUrl = `${ext.serverUrl}/arabizi.png`;

  // Loading — sidepanel surface. Slow SSE so the cursor is visible.
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    imageTranslateSurface: 'sidepanel',
  });
  await resetRoutes(ext.context);
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await new Promise((r) => setTimeout(r, 2_500));
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: [
        `event: message_start`,
        `data: {"type":"message_start","message":{"id":"m1","type":"message","role":"assistant","content":[]}}`,
        ``,
        `event: content_block_delta`,
        `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"\\"Welcome from image\\""}}`,
        ``,
        `event: message_stop`,
        `data: {"type":"message_stop"}`,
        ``,
      ].join('\n'),
    });
  });
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.locator('#sp-text').waitFor({
    state: 'visible',
    timeout: 5_000,
  }); /* mount-ready: conv-stream only renders once a turn exists */
  await sp.evaluate(async (url) => {
    await chrome.runtime.sendMessage({
      kind: 'image:translate',
      requestId: crypto.randomUUID(),
      imageUrl: url,
    });
  }, imageUrl);
  // Intentional pause inside the 2.5s SSE hold so the loading cursor is on screen.
  await sp.waitForTimeout(800); // wait for mid-flight streaming state (no observable "mid-stream" DOM condition)
  await shot(sp, 'image-translate-loading', {
    surface: 'image-ocr',
    state: 'loading',
    theme: 'light',
    userAction: 'user dispatched image:translate; capture mid-stream in sidepanel surface',
    expectations: [
      'assistant turn shows shimmer or cursor',
      'no broken render rectangle',
      'input footer still visible',
    ],
  });
  await sp.close();
  await resetRoutes(ext.context);

  // Result — tooltip surface with image + filled body.
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    tooltipClickOutside: false,
    imageTranslateSurface: 'tooltip',
  });
  const resultPage = await ext.context.newPage();
  await resultPage.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(resultPage);
  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  const resultHandle = await sendImageTranslatePending(opts, ext.serverUrl, imageUrl);
  await sendImageTranslateResult(opts, resultHandle, {
    translation: 'Welcome from image',
    confidence: 0.92,
  });
  await opts.close();
  // Gate on the image too: without it the capture lands while the `<img>` is still 0x0.
  await resultPage.waitForFunction(
    () => {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      const body = root?.querySelector('.tooltip .body');
      if (!body?.textContent.includes('Welcome')) return false;
      const img = root?.querySelector<HTMLImageElement>('.tooltip img.tooltip-image-source');
      return !!img && img.complete && img.naturalWidth > 1 && img.naturalHeight > 1;
    },
    { timeout: 5_000, polling: 250 },
  );
  await resultPage.waitForTimeout(250); // wait for image-inline tooltip CSS entrance animation (no observable end state)
  await shot(resultPage, 'image-translate-result', {
    surface: 'image-ocr',
    state: 'result',
    theme: 'light',
    userAction: 'image-translate result landed; tooltip surface shows image + body',
    expectations: [
      'image at top of tooltip, natural aspect preserved (80×40 fixture)',
      'translation body filled below',
      'confidence pill inside card radius',
      'no Explain action visible (image-ocr disables it)',
    ],
  });
  await resultPage.close();
});

test('Page-translate — progress + done + inline-replace progress', async () => {
  test.slow();

  // A slow mock holds the SSEs open, so the shimmer states are on screen even though the batch driver runs in parallel.
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    defaultDisplayMode: 'inline',
  });
  await resetRoutes(ext.context);
  mockAnthropic(ext.context, { translation: 'TRANSLATED', delayMs: 2_500 });
  const progressPage = await ext.context.newPage();
  await progressPage.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(progressPage);
  await pickAreasAndTranslate(ext, progressPage, ['c1', 'c2']);
  // Intentional pause inside the 2.5s mock delay — captures shimmer mid-flight.
  await progressPage.waitForTimeout(800); // wait for mid-flight batch state (no observable "mid-stream" DOM condition)
  await shot(progressPage, 'page-translate-progress', {
    surface: 'page-translate',
    state: 'progress',
    theme: 'light',
    userAction: 'user picked two areas and hit Translate; capture while blocks are mid-flight',
    expectations: [
      'multiple paragraph wrappers visible',
      'shimmer in at least one wrapper indicates in-flight',
      'wrappers only around the two areas the user picked',
    ],
  });
  // Wrappers are inserted before any chunk lands, so a count check alone ticks true on the `…` placeholder.
  await progressPage
    .waitForFunction(
      () => {
        const wraps = Array.from(document.querySelectorAll('[data-ega-replaced]'));
        if (wraps.length < 2) return false;
        return wraps.every(
          (w) =>
            w.getAttribute('data-ega-tx-state') === 'ok' && !w.querySelector('.ega-inline-shimmer'),
        );
      },
      // Interval polling, not rAF: a throttled page never runs the rAF callback that enforces the timeout.
      { timeout: 15_000, polling: 250 },
    )
    .catch(() => undefined);
  await shot(progressPage, 'page-translate-done', {
    surface: 'page-translate',
    state: 'done',
    theme: 'light',
    userAction: 'all batches resolved; every wrapper committed its translated text',
    expectations: [
      'every wrapper shows translated text (no trailing …)',
      'no nested shimmer remains',
      'wrappers only around the picked areas',
    ],
  });
  await progressPage.close();
  await resetRoutes(ext.context);

  // Slow mock again so the mid-flight skeleton in the wrapper is in frame.
  mockAnthropic(ext.context, { translation: 'TRANSLATED', delayMs: 2_500 });
  const inlinePage = await ext.context.newPage();
  await inlinePage.goto(`${ext.serverUrl}/inline-replace-page.html`);
  await waitForTestHooks(inlinePage);
  await inlinePage.locator('body').focus();
  await inlinePage.evaluate(() => {
    const el = document.getElementById('target');
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });
  await inlinePage.keyboard.press('Control+Shift+L');
  // Intentional pause inside the 2.5s SSE hold so shimmer is visible.
  await inlinePage.waitForTimeout(800); // wait for mid-flight inline-replace state (no observable "mid-stream" DOM condition)
  await shot(inlinePage, 'inline-replace-progress', {
    surface: 'page-translate',
    state: 'inline-replace-progress',
    theme: 'light',
    userAction: 'single selection + inline-replace mode mid-translate; capture in flight',
    expectations: [
      'one wrapper visible around the selected text',
      'original text stays visible, dimmed, inside the wrapper',
      'rest of the page untouched',
    ],
  });
  await inlinePage.close();
  await resetRoutes(ext.context);
});

async function openTemplatesWorkbench(page: Page): Promise<void> {
  await page.locator('[role="tab"]:has-text("Templates")').first().click();
  await page.waitForTimeout(300); // wait for tab panel CSS transition (no observable end state)
}

function templateChip(page: Page, id: string): ReturnType<Page['locator']> {
  return page.locator(`[data-ega-workbench-chip="${id}"]`).first();
}

test('Templating — rules editor + describe-change states', async () => {
  // 5 shots + 1 describe-change LLM hold + 1 reload. Comfortably under slow().
  test.slow();
  const SEED_RULES = [
    {
      id: 'shot-rule-host',
      body: 'On twitter.com always preserve hashtags verbatim.',
      category: 'always' as const,
      scope: { tasks: [], sites: ['twitter.com'] },
      source: 'manual' as const,
      addedAt: new Date().toISOString(),
      enabled: true,
    },
    {
      id: 'shot-rule-task',
      body: 'Prefer concise summaries — under 200 words.',
      category: 'prefer' as const,
      scope: { tasks: ['summarize' as const] },
      source: 'recipe' as const,
      recipeId: 'summarize-concise',
      addedAt: new Date().toISOString(),
      enabled: true,
    },
    {
      id: 'shot-rule-always',
      body: 'Always preserve URLs verbatim across every task.',
      category: 'always' as const,
      scope: { tasks: [] },
      source: 'manual' as const,
      addedAt: new Date().toISOString(),
      enabled: false,
    },
  ];

  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test-templating-shots',
    advanced: {
      promptTemplate: { system: 'You are a helpful translator.', user: '{{text}}' },
      perPresetTemplates: {},
      taskTemplates: {},
      rules: SEED_RULES,
      snippets: {},
      temperature: 0.2,
      maxTokens: 2048,
    },
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');
  await openTemplatesWorkbench(page);

  // --- Rules editor (populated) ---
  await templateChip(page, 'rules').click();
  await page.waitForTimeout(400); // wait for chip workbench mount animation (no observable end state)
  await expect(page.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });
  // The rows the sidecar declares live inside the collapsed "Advanced rules" details — expand first.
  await page.locator('summary.advanced-rules-summary').click();
  await page.waitForTimeout(200); // wait for <details> expand animation (no observable end state)
  await expect(page.locator('[data-ega-rule-site-chip="twitter.com"]')).toBeVisible();
  await expect(page.locator('[data-ega-rule-task-chip="summarize"]')).toBeVisible();
  await expect(page.locator('[data-ega-rule-category]')).toHaveCount(3);
  await shot(page, 'rules-editor-populated', {
    surface: 'templates',
    state: 'rules-editor-populated',
    theme: 'light',
    userAction:
      'user opened the Rules chip with three rules seeded and expanded "Advanced rules" — host-scoped, task-scoped, and an always-rule that is disabled',
    expectations: [
      'three rule rows visible',
      'host chip "twitter.com ×" rendered on the first row',
      'task chip "Summarize ×" rendered on the second row',
      'third row visually marked as disabled (dim/strikethrough)',
      'category select column reachable on each row',
      'source pill (manual/recipe) visible on each row',
    ],
  });

  // --- Rules editor (add-form open) --- the manual form is inside the now-expanded "Advanced rules".
  await page.locator('details.manual-block > summary').click();
  await page.waitForTimeout(300); // wait for <details> expand animation (no observable end state)
  await shot(page, 'rules-editor-add-form-open', {
    surface: 'templates',
    state: 'rules-editor-add-form-open',
    theme: 'light',
    userAction: 'user clicked "Add rule manually" — the form details element is expanded',
    expectations: [
      'manual-add form is expanded ABOVE the rule list, at the top of the Advanced-rules body',
      'Rule text textarea visible',
      'Task chip row labeled "Tasks (empty = all)" visible',
      'Sites input labeled "Sites (comma-separated, optional)" visible',
      'Add rule primary CTA visible and disabled while Rule text is empty',
    ],
  });
  await page.locator('details.manual-block > summary').click();
  await page.waitForTimeout(200); // wait for <details> collapse animation (no observable end state)

  // Reseed with empty rules so the empty-state CTA renders and the describe-change walk reuses this page.
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'You are a helpful translator.', user: '{{text}}' },
      perPresetTemplates: {},
      taskTemplates: {},
      rules: [],
      snippets: {},
      temperature: 0.2,
      maxTokens: 2048,
    },
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await openTemplatesWorkbench(page);
  await templateChip(page, 'rules').click();
  await page.waitForTimeout(400); // wait for chip workbench mount animation (no observable end state)
  await shot(page, 'rules-editor-empty-with-describe', {
    surface: 'templates',
    state: 'rules-editor-empty-with-describe',
    theme: 'light',
    userAction:
      'user opened Rules chip with zero rules — describe-your-change input sits above an empty-state CTA',
    expectations: [
      'describe-change input row visible with Apply button',
      'empty-state card "No rules yet" rendered',
      '"Pick a recipe" empty-state CTA visible',
      'no rule rows rendered',
    ],
  });

  // --- Describe-change loading (mid LLM call) --- hand-rolled JSON, not mockAnthropic: describeChange calls `res.json()`, so an SSE body fails to parse.
  const describeReply = JSON.stringify({
    category: 'always',
    body: 'Always preserve emoji exactly as written in the source.',
    scope: { tasks: [] },
  });
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        id: 'msg_describe_shot',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: describeReply }],
        stop_reason: 'end_turn',
      }),
    });
  });
  const describeInput = page.locator('[data-ega-describe-input]').first();
  await describeInput.fill('preserve emojis unchanged');
  await page.locator('[data-ega-describe-apply]').first().click();
  // Intentional pause inside the 1.5s LLM mock hold so the loading spinner is visible.
  await page.waitForTimeout(500); // wait for mid-flight describe-change state (no observable "loading" DOM condition)
  await shot(page, 'describe-change-loading', {
    surface: 'templates',
    state: 'describe-change-loading',
    theme: 'light',
    userAction: 'user typed "preserve emojis unchanged" and clicked Apply; capture mid-LLM-call',
    expectations: [
      'Apply button shows loading spinner state',
      'input is disabled (busy state)',
      '"Asking your model…" busy label is visible beneath the row',
      'no rule has been appended to storage yet',
    ],
  });

  // --- Describe-change result (rule appended) ---
  await expect
    .poll(async () => (await page.locator('[data-ega-rule-row]').count()) > 0, { timeout: 10_000 })
    .toBe(true);
  await page.waitForTimeout(400); // wait for rule row CSS entrance animation (no observable end state)
  await shot(page, 'describe-change-result', {
    surface: 'templates',
    state: 'describe-change-result',
    theme: 'light',
    userAction: 'describe-change LLM call resolved; new rule appended to the rule list',
    expectations: [
      'exactly one new rule row visible',
      'rule body text mentions emoji (LLM-derived body)',
      'describe-change input is empty + re-enabled',
      'success toast may be visible',
    ],
  });
  await resetRoutes(ext.context);
  await page.close();
});

test('Templating — snippets + per-preset + per-site', async () => {
  // Heaviest test in the family: slow()'s 90s ceiling is too tight, so it gets 180s.
  test.setTimeout(180_000);

  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'You are a helpful translator.', user: '{{text}}' },
      perPresetTemplates: {
        arabizi: {
          system: '/* SEEDED PRESET OVERRIDE */ Arabizi-aware translator.',
          user: 'Treat the source as arabizi: {{text}}',
        },
      },
      taskTemplates: {},
      rules: [],
      snippets: {
        formal_register: 'Use a formal register throughout.',
        keep_emoji: 'Preserve emoji unchanged in the target.',
        tag_uncertain: 'Wrap uncertain translations in [?…] markers.',
      },
      temperature: 0.2,
      maxTokens: 2048,
    },
    sitePrefs: {
      'reddit.com': {
        defaultLang: 'es',
      },
    },
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');
  await openTemplatesWorkbench(page);

  // --- Snippets list populated ---
  await templateChip(page, 'snippets').click();
  await page.waitForTimeout(400); // wait for chip workbench mount animation (no observable end state)
  await expect(page.locator('[data-ega-snippet-editor]')).toBeVisible({ timeout: 5_000 });
  await shot(page, 'snippets-list-populated', {
    surface: 'templates',
    state: 'snippets-list-populated',
    theme: 'light',
    userAction: 'user opened Snippets chip with three snippets seeded',
    expectations: [
      'three snippet rows visible',
      'snippet name and body textarea reachable on each row',
      '"+ New snippet" primary CTA visible at the top',
      'rename + delete actions present on each row',
    ],
  });

  // --- Snippets add form ---
  await page.locator('[data-ega-snippet-editor] button:has-text("+ New snippet")').first().click();
  await page.waitForTimeout(400); // wait for new snippet row mount animation (no observable end state)
  await shot(page, 'snippets-add-form-open', {
    surface: 'templates',
    state: 'snippets-add-form-open',
    theme: 'light',
    userAction: 'user clicked "+ New snippet" — new empty snippet row appended for editing',
    expectations: [
      'four snippet rows visible (three seeded + one new)',
      'newly added row has an empty body textarea ready for typing',
      'name "snippet1" or similar auto-generated default visible on the new row',
    ],
  });

  // --- Per-preset override (active) ---
  await templateChip(page, 'per-preset').click();
  await page.waitForTimeout(400); // wait for chip workbench mount animation (no observable end state)
  const presetSelect = page.locator('[data-ega-prompt-workbench] select').first();
  if ((await presetSelect.count()) > 0) {
    await presetSelect.selectOption('arabizi');
    await page.waitForTimeout(500); // wait for preset editor reload + template fetch (no observable end state)
  }
  await shot(page, 'per-preset-override-active', {
    surface: 'templates',
    state: 'per-preset-override-active',
    theme: 'light',
    userAction:
      'user picked the arabizi preset; an override is already seeded so the editor mounts with the override body and a Clear language override action is reachable',
    expectations: [
      'preset selector shows arabizi as picked',
      'template editor mounts with the SEEDED PRESET OVERRIDE body visible',
      '"Clear language override" reset action visible somewhere in the workbench',
      'no scope inheritance ambiguity — clearly an override, not the default global template',
    ],
  });

  // --- Site overrides review (Advanced > Data) ---
  await page.locator('[role="tab"]:has-text("Advanced")').first().click();
  await page.waitForTimeout(300); // wait for tab panel CSS transition (no observable end state)
  await page.locator('[data-ega-subtab="data"]').click();
  await page.waitForTimeout(400); // wait for sub-tab panel mount animation (no observable end state)
  await expect(page.locator('[data-ega-site-overrides-review]')).toBeVisible({ timeout: 5_000 });
  await shot(page, 'site-overrides-review-populated', {
    surface: 'options',
    state: 'site-overrides-review-populated',
    theme: 'light',
    userAction:
      'user opened Advanced > Data with reddit.com seeded in sitePrefs; review list lists the host with status pills',
    expectations: [
      'reddit.com host row visible in the Site overrides review',
      'per-row clear (×) button reachable',
      'footer Clear all action visible',
      'no add-host or template editor inline — page-side gestures own those',
    ],
  });

  await page.close();
});

test('Templating — recipes filtered + apply confirm + slot palette insert', async () => {
  // 3 shots + 1 dialog open + 1 popover open. Light test.
  test.slow();

  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'You are a helpful translator.', user: '{{text}}' },
      perPresetTemplates: {},
      taskTemplates: {},
      rules: [],
      snippets: {},
      temperature: 0.2,
      maxTokens: 2048,
    },
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');
  await openTemplatesWorkbench(page);

  // --- Recipes filtered by task ---
  await templateChip(page, 'recipes').click();
  await page.waitForTimeout(400); // wait for chip workbench mount animation (no observable end state)
  const explainFilter = page.locator('[data-ega-recipe-filter="explain"]').first();
  if ((await explainFilter.count()) > 0) {
    await explainFilter.click();
    await page.waitForTimeout(400); // wait for filter transition + card list re-render (no observable end state)
  }
  await shot(page, 'templates-recipes-filtered', {
    surface: 'templates',
    state: 'templates-recipes-filtered',
    theme: 'light',
    userAction: 'user clicked the explain filter chip in the Recipes gallery',
    expectations: [
      'task-filter strip shows explain as the active chip',
      'only explain-task recipe cards are rendered',
      'card count is smaller than the unfiltered gallery — narrowed list visibly distinct',
    ],
  });

  // --- Recipes apply confirm (structured-diff Dialog open) --- `explain-quick-tldr` carries both rule changes and a maxTokens param, so its diff shows the most.
  await page.locator('[data-ega-recipe-filter="all"]').first().click();
  await page.waitForTimeout(300); // wait for filter reset + card list re-render (no observable end state)
  const targetCard = page
    .locator('[data-ega-recipe-card][data-ega-recipe-id="explain-quick-tldr"]')
    .first();
  if ((await targetCard.count()) > 0) {
    await targetCard.locator('[data-ega-recipe-apply]').first().click();
    await page.waitForTimeout(500); // wait for structured-diff dialog mount animation (no observable end state)
  }
  await shot(page, 'templates-recipes-apply-pending', {
    surface: 'templates',
    state: 'templates-recipes-apply-pending',
    theme: 'light',
    userAction:
      'user clicked Apply on the explain-quick-tldr recipe; structured-diff confirm dialog open',
    expectations: [
      'modal dialog mounts with a diff/summary of changes to apply',
      'primary Apply CTA + secondary Cancel reachable inside the dialog',
      'scrim covers the workbench behind uniformly',
      'underlying recipes gallery remains visible-but-dimmed',
    ],
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200); // wait for dialog dismiss animation (no observable end state)

  // --- Slot palette + insert-variable popover open ---
  await templateChip(page, 'global').click();
  await page.waitForTimeout(400); // wait for chip workbench mount animation (no observable end state)
  const insertBtn = page.locator('button:has-text("Insert variable")').first();
  if ((await insertBtn.count()) > 0) {
    await insertBtn.click();
    await page.waitForTimeout(600); // wait for popover mount + position recompute (no observable end state)
  }
  await shot(page, 'slot-palette-insert-open', {
    surface: 'templates',
    state: 'slot-palette-insert-open',
    theme: 'light',
    userAction: 'user opened the Global chip and clicked the Insert variable picker',
    expectations: [
      'slot palette is visible above the editor',
      'variable picker popover anchors to the trigger button',
      'popover does NOT cover the slot palette pills',
      'search input inside the popover is focused',
      'list of slot variables visible inside the popover',
    ],
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200); // wait for popover dismiss animation (no observable end state)

  await page.close();
});

test('Advanced — landing in dark theme', async () => {
  test.slow();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');
  await page.locator('[role="tab"]:has-text("Advanced")').first().click();
  await page.waitForTimeout(400); // wait for tab panel CSS transition (no observable end state)
  await applyThemeOnPage(page, 'dark');
  await shot(page, '00-advanced-landing-dark', {
    surface: 'options',
    state: 'landing',
    theme: 'dark',
    userAction: 'user opened the Advanced tab in dark theme',
    expectations: [
      'top tab strip + Advanced sub-tab strip + left rail render in dark tokens',
      'same sub-tabs as the light variant (Diagnostics / Data / Labs), Diagnostics active',
      'no orphan light-mode surfaces leak through',
    ],
  });
  await page.close();
});

// The banner renders above the tab body on the display and backends tabs only.
test('Onboarding — banner on display + backends tabs', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: '',
    openaiApiKey: '',
    geminiApiKey: '',
    groqApiKey: '',
    deepseekApiKey: '',
    onboardingDismissed: false,
  });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');
  await page.locator(`#tab-translate`).click();
  await page.waitForTimeout(400); // wait for tab panel mount animation (no observable end state)
  await shot(page, 'onboarding-banner-display', {
    surface: 'options',
    state: 'onboarding-banner-display',
    theme: 'light',
    userAction: 'fresh install — Translate tab opens with the onboarding banner above the panel',
    expectations: [
      'onboarding banner visible at the top of the panel',
      'Welcome / Pick a backend copy legible',
      'primary "Add a free Gemini key" CTA distinguishable from "Advanced / skip"',
      'sub-label under the primary CTA legible',
    ],
  });
  await page.locator(`#tab-backends`).click();
  await page.waitForTimeout(400); // wait for tab panel mount animation (no observable end state)
  await shot(page, 'onboarding-banner-backends', {
    surface: 'options',
    state: 'onboarding-banner-backends',
    theme: 'light',
    userAction:
      'user clicked the Backends tab — onboarding banner persists above the backends panel',
    expectations: [
      'banner still visible above the Backends panel',
      'no double-banner / no banner above + below collision',
      'backend cards visible beneath the banner',
    ],
  });
  await page.close();
});

test('Smart-bubble — digit-less + short-suppressed + dark', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    bubbleMode: 'smart',
    sitePrefs: {},
  });

  // Digit-less arabizi paragraph — inject inline so the fixture stays unchanged.
  const digitless = await ext.context.newPage();
  await digitless.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(digitless);
  await digitless.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'digitless-arabizi';
    p.textContent = 'yarayt rase fade add rasak';
    document.body.appendChild(p);
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });
  await digitless
    .waitForFunction(
      () => {
        const host = document.querySelector('#ega-shadow-host');
        const root = (host as HTMLElement | null)?.shadowRoot;
        return !!root?.querySelector('.bubble');
      },
      { timeout: 5_000, polling: 250 },
    )
    .catch(() => undefined);
  await digitless.waitForTimeout(200); // wait for bubble CSS entrance animation (no observable end state)
  await shot(digitless, 'smart-bubble-digitless-arabizi', {
    surface: 'smart-bubble',
    state: 'digitless-arabizi',
    theme: 'light',
    userAction:
      'user selected digit-less arabizi prose; smart bubble mounts after the looksLikeEnglish gate',
    expectations: [
      'bubble visible below the selection',
      // The pill shows what detectLang matched; the bubble mounted on the not-English fallback, so it reads auto.
      'source-lang pill reads auto — the variety detector did not fire on digit-less prose',
      'no false-positive English suppression',
    ],
  });
  await digitless.close();

  // Short arabizi (3 chars) should suppress — false-positive guard.
  const shortPage = await ext.context.newPage();
  await shortPage.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(shortPage);
  await shortPage.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'short-arabizi';
    p.textContent = 'hi';
    document.body.appendChild(p);
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });
  // Negative test: bubble must NOT appear. 800ms covers debounce + content-script propagation.
  await shortPage.waitForTimeout(800); // wait for selectionchange debounce + content-script settle (negative check)
  await shot(shortPage, 'smart-bubble-short-arabizi-suppressed', {
    surface: 'smart-bubble',
    state: 'short-arabizi-suppressed',
    theme: 'light',
    userAction:
      'user selected a 2-character string; smart bubble must NOT mount (false-positive guard)',
    expectations: [
      'NO bubble visible in or around the selection',
      'page renders normally',
      'no orphan overlay artifacts',
    ],
  });
  await shortPage.close();

  const darkBubble = await ext.context.newPage();
  await darkBubble.goto(`${ext.serverUrl}/smart-bubble-page.html`);
  await waitForTestHooks(darkBubble);
  await applyThemeOnPage(darkBubble, 'dark');
  await darkBubble.evaluate(() => {
    const el = document.getElementById('arabizi');
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });
  await darkBubble
    .waitForFunction(
      () => {
        const host = document.querySelector('#ega-shadow-host');
        const root = (host as HTMLElement | null)?.shadowRoot;
        return !!root?.querySelector('.bubble');
      },
      { timeout: 5_000, polling: 250 },
    )
    .catch(() => undefined);
  await darkBubble.waitForTimeout(200); // wait for bubble CSS entrance animation (no observable end state)
  await shot(darkBubble, 'smart-bubble-default-dark', {
    surface: 'smart-bubble',
    state: 'default',
    theme: 'dark',
    userAction: 'user selected arabizi in dark theme; smart bubble mounts in dark tokens',
    expectations: [
      'bubble visible below selection',
      'dark surface tokens applied to the bubble chrome',
      'parity with light variant in structure',
    ],
  });
  await darkBubble.close();
});

test('Tooltip — confidence pill shown + hidden', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, { ...TOOLTIP_SEED, confidencePill: true });
  await resetRoutes(ext.context);
  mockAnthropic(ext.context, { translation: 'Welcome.', confidence: 0.92 });
  const shown = await ext.context.newPage();
  await landTooltipBody(shown, 'Welcome');
  await shot(shown, 'tooltip-confidence-pill-shown', {
    surface: 'tooltip',
    state: 'confidence-pill-shown',
    theme: 'light',
    userAction: 'confidencePill=true + confidence=0.92; tooltip surfaces the pill in the topbar',
    expectations: [
      'confidence pill visible inside the card radius',
      'percentage / level label legible',
      'pill does NOT overlap the body text',
    ],
  });
  await shown.close();

  // Pill hidden — low confidence below threshold (or pill disabled).
  await seedSettings(ext.context, ext.extensionId, { ...TOOLTIP_SEED, confidencePill: false });
  await resetRoutes(ext.context);
  mockAnthropic(ext.context, { translation: 'Welcome.', confidence: 0.92 });
  const hidden = await ext.context.newPage();
  await landTooltipBody(hidden, 'Welcome');
  await shot(hidden, 'tooltip-confidence-pill-hidden', {
    surface: 'tooltip',
    state: 'confidence-pill-hidden',
    theme: 'light',
    userAction: 'confidencePill=false; tooltip suppresses the pill entirely',
    expectations: [
      'NO confidence pill visible in the topbar',
      'body text + topbar buttons still legible',
      'no orphan empty pill slot',
    ],
  });
  await hidden.close();
});

test('Tooltip — loading + image-inline in dark theme', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, { ...TOOLTIP_SEED, theme: 'dark' });
  await resetRoutes(ext.context);
  mockAnthropic(ext.context, { translation: 'Welcome! How are you doing?', delayMs: 2000 });
  const loadingDark = await ext.context.newPage();
  await loadingDark.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(loadingDark);
  await applyThemeOnPage(loadingDark, 'dark');
  await loadingDark.locator('body').focus();
  await selectArabiziParagraph(loadingDark);
  await loadingDark.keyboard.press('Control+Shift+L');
  await loadingDark
    .waitForFunction(
      () => {
        const host = document.querySelector('#ega-shadow-host');
        const root = (host as HTMLElement | null)?.shadowRoot;
        return !!root?.querySelector('.tooltip .shimmer');
      },
      { timeout: 5_000, polling: 250 },
    )
    .catch(() => undefined);
  await shot(loadingDark, 'tooltip-loading-dark', {
    surface: 'tooltip',
    state: 'loading',
    theme: 'dark',
    userAction: 'user triggered translate in dark; capture while shimmer is on screen',
    expectations: [
      'shimmer renders in dark surface tokens',
      'topbar buttons still legible in dark',
      'parity with light loading variant',
    ],
  });
  await loadingDark.close();
  await resetRoutes(ext.context);

  const imageUrl = `${ext.serverUrl}/arabizi.png`;
  const imgDark = await ext.context.newPage();
  await imgDark.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(imgDark);
  await applyThemeOnPage(imgDark, 'dark');
  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  const darkHandle = await sendImageTranslatePending(opts, ext.serverUrl, imageUrl);
  await sendImageTranslateResult(opts, darkHandle, {
    translation: 'Welcome from image',
    confidence: 0.92,
  });
  await opts.close();
  // Gate on the image: element presence alone does not mean the pixels are ready.
  await imgDark.waitForFunction(
    () => {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      const img = root?.querySelector<HTMLImageElement>('.tooltip img.tooltip-image-source');
      return !!img && img.complete && img.naturalWidth > 1 && img.naturalHeight > 1;
    },
    { timeout: 10_000, polling: 250 },
  );
  await imgDark.waitForTimeout(300); // wait for image-inline tooltip CSS entrance animation (no observable end state)
  await shot(imgDark, 'tooltip-image-inline-dark', {
    surface: 'tooltip',
    state: 'image-inline',
    theme: 'dark',
    userAction: 'image-translate result lands in dark theme; tooltip shows image header + body',
    expectations: [
      'image at top of card retains aspect ratio',
      'dark surface tokens applied to body and topbar',
      'confidence pill inside card radius',
    ],
  });
  await imgDark.close();
  // One shared context, one worker: leaving `theme: 'dark'` seeded stamps every
  // later shot dark while its sidecar still declares light.
  await seedSettings(ext.context, ext.extensionId, { theme: 'light' });
});

test('Image-translate — tooltip error', async () => {
  test.slow();
  const imageUrl = `${ext.serverUrl}/arabizi.png`;
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    imageTranslateSurface: 'tooltip',
  });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  // A failure rides the same wire as a success, with an empty `translation` and a populated `error`.
  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  const errorHandle = await sendImageTranslatePending(opts, ext.serverUrl, imageUrl);
  await sendImageTranslateResult(opts, errorHandle, {
    translation: '',
    confidence: 0,
    error: { code: 'UNKNOWN', message: 'image-translate failed upstream' },
  });
  await opts.close();
  await page
    .waitForFunction(
      () => {
        const host = document.querySelector('#ega-shadow-host');
        const root = (host as HTMLElement | null)?.shadowRoot;
        return !!root?.querySelector('.tooltip');
      },
      { timeout: 10_000, polling: 250 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(300); // wait for tooltip CSS entrance animation (no observable end state)
  await shot(page, 'image-translate-error', {
    surface: 'image-ocr',
    state: 'error',
    theme: 'light',
    userAction: 'image-translate failed upstream; tooltip surfaces error label',
    expectations: [
      'error tone token applied to the body',
      'no broken image render (graceful failure)',
      'retry or dismiss affordance reachable',
    ],
  });
  await page.close();
});

test('Sidepanel — empty + streaming in dark theme', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
  });
  const empty = await ext.context.newPage();
  await empty.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await empty.waitForLoadState('networkidle');
  await clearConversations(empty);
  await applyThemeOnPage(empty, 'dark');
  await empty.waitForTimeout(300); // wait for CSS custom-property cascade repaint (no observable end state)
  await shot(empty, 'sidepanel-empty-dark', {
    surface: 'sidepanel',
    state: 'empty',
    theme: 'dark',
    userAction: 'user opened the side panel in dark theme with no prior conversation',
    expectations: [
      'empty-state CTA visible in dark tokens',
      'input footer reachable',
      'parity with light empty variant in structure',
    ],
  });
  await empty.close();

  // A fresh page, so the dark tokens are in place before the first turn.
  await resetRoutes(ext.context);
  mockAnthropic(ext.context, { translation: 'Hello, friend.', delayMs: 1500, times: 1 });
  const streaming = await ext.context.newPage();
  await streaming.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await streaming.waitForLoadState('networkidle');
  await applyThemeOnPage(streaming, 'dark');
  await streaming.locator('#sp-text').fill('hola');
  await streaming.getByRole('button', { name: /^Translate$/ }).click();
  // Intentional pause inside the SSE hold so the streaming cursor is on screen.
  await streaming.waitForTimeout(600); // wait for mid-flight streaming state (no observable "mid-stream" DOM condition)
  await shot(streaming, 'sidepanel-streaming-dark', {
    surface: 'sidepanel',
    state: 'streaming',
    theme: 'dark',
    userAction: 'first translation mid-stream in dark theme',
    expectations: [
      'assistant turn shimmer / cursor visible against dark tokens',
      'input footer still legible',
      'no broken-render rectangle',
    ],
  });
  await streaming
    .locator('.ega-cursor')
    .waitFor({ state: 'detached', timeout: 5_000 })
    .catch(() => undefined);
  await streaming.close();
  await resetRoutes(ext.context);
});

test('Sidepanel — quick-refine applied', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
  });
  await resetRoutes(ext.context);

  // First turn lands cleanly so the quick-refine chip strip is reachable.
  mockAnthropic(ext.context, { translation: 'Hello, friend.', times: 1 });
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await clearConversations(sp);
  await sp.waitForLoadState('networkidle');
  await sp.locator('#sp-text').fill('hola');
  await sp.getByRole('button', { name: /^Translate$/ }).click();
  await sp
    .locator('.ega-cursor')
    .waitFor({ state: 'detached', timeout: 8_000 })
    .catch(() => undefined);
  await sp.waitForTimeout(300); // wait for post-stream CSS transition + chip strip mount (no observable end state)

  // unrouteAll first, or the previous `times: 1` handler races the refine request and throws "Route is already handled".
  await resetRoutes(ext.context);
  mockAnthropic(ext.context, { translation: 'Hi.', times: 1 });
  const shorter = sp.locator('[data-ega-refine-chip="shorter"]');
  if (await shorter.isVisible().catch(() => false)) {
    await shorter.click();
    await sp
      .locator('.ega-cursor')
      .waitFor({ state: 'detached', timeout: 8_000 })
      .catch(() => undefined);
    await sp.waitForTimeout(300); // wait for post-stream CSS transition + refine state settle (no observable end state)
  }
  // A refine replaces the assistant on the SAME user turn, so a second user turn here means a regression.
  await expect(sp.locator('.ega-user-turn')).toHaveCount(1);
  await expect(sp.locator('.ega-assistant-turn')).toHaveCount(1);
  await expect(sp.locator('.ega-assistant-turn').last()).toContainText('Hi.');
  await shot(sp, 'sidepanel-quick-refine-applied', {
    surface: 'sidepanel',
    state: 'quick-refine-applied',
    theme: 'light',
    userAction: 'user clicked "shorter" — the assistant turn has been refined in place',
    expectations: [
      'assistant body shows the refined (shorter) translation',
      'prior assistant body no longer the active translation',
      'quick-refine chip strip remains reachable for further refinement',
    ],
  });
  await resetRoutes(ext.context);
  await sp.close();
});

test('Sidepanel — retry after error', async () => {
  test.slow();
  // Cache off, or retry short-circuits to a sibling test's cached 'hola'; native off, or the chain rotates to it and hangs.
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    cacheEnabled: false,
    disabledBackends: ['native'],
  });
  // 503, not 401: AUTH is terminal and shows "Open settings" instead of a Retry button.
  await resetRoutes(ext.context);
  await ext.context.route(
    'https://api.anthropic.com/v1/messages',
    async (route) => {
      await route.fulfill({
        status: 503,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          error: { type: 'overloaded_error', message: 'service unavailable' },
        }),
      });
    },
    { times: 1 },
  );
  const retry = await ext.context.newPage();
  await retry.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await clearConversations(retry);
  await retry.waitForLoadState('networkidle');
  // A unique input string, so a prior test's cache entry cannot match and swallow the 503.
  await retry.locator('#sp-text').fill('retry path probe');
  await retry.getByRole('button', { name: /^Translate$/ }).click();
  await retry
    .locator('.ega-assistant-error')
    .waitFor({ state: 'visible', timeout: 10_000 })
    .catch(() => undefined);
  // unrouteAll first, or the 503 handler can fire again on the retry click.
  await resetRoutes(ext.context);
  mockAnthropic(ext.context, { translation: 'Hello again.', times: 1 });
  // Wait for the button, not `isVisible()` — a bare check races the error mount and skips the retry silently.
  const retryBtn = retry.locator('.ega-retry-btn');
  await retryBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await retryBtn.click();
  // 15s, not 8s: the first dispatch in a fresh context is cold (SW init + build warmup).
  await retry.locator('.ega-assistant-error').waitFor({ state: 'detached', timeout: 15_000 });
  await retry
    .locator('.ega-assistant-turn')
    .last()
    .getByText('Hello again.')
    .waitFor({ state: 'visible', timeout: 15_000 });
  // A retry replaces the assistant on the SAME user turn, so a second user turn here means a regression.
  await expect(retry.locator('.ega-user-turn')).toHaveCount(1);
  await expect(retry.locator('.ega-assistant-turn')).toHaveCount(1);
  await expect(retry.locator('.ega-assistant-error')).toHaveCount(0);
  // Assert the body too: a cached sibling result would also render an error-free turn.
  await expect(retry.locator('.ega-assistant-turn').last()).toContainText('Hello again.');
  await shot(retry, 'sidepanel-retry-after-error', {
    surface: 'sidepanel',
    state: 'retry-after-error',
    theme: 'light',
    userAction:
      'user clicked retry after a 503 — the assistant turn now shows the recovered translation',
    expectations: [
      'NO error block in the latest assistant turn',
      'assistant body filled with translated text',
      'quick-refine chip strip visible beneath the recovered turn',
    ],
  });
  await retry.close();
  await resetRoutes(ext.context);
});

test('Confirm dialog — delete rule', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    advanced: {
      promptTemplate: { system: 'You are a helpful translator.', user: '{{text}}' },
      perPresetTemplates: {},
      taskTemplates: {},
      rules: [
        {
          id: 'shot-rule-delete',
          body: 'Always preserve URLs verbatim across every task.',
          category: 'always' as const,
          scope: { tasks: [] },
          source: 'manual' as const,
          addedAt: new Date().toISOString(),
          enabled: true,
        },
      ],
      snippets: {},
      temperature: 0.2,
      maxTokens: 2048,
    },
  });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');
  await page.locator('[role="tab"]:has-text("Templates")').first().click();
  await page.waitForTimeout(300); // wait for tab panel CSS transition (no observable end state)
  await page.locator(`[data-ega-workbench-chip="rules"]`).first().click();
  await page.waitForTimeout(400); // wait for chip workbench mount animation (no observable end state)
  const deleteBtn = page
    .locator('[data-ega-rule-row]')
    .first()
    .getByRole('button', { name: /delete/i })
    .first();
  if ((await deleteBtn.count()) > 0) {
    await deleteBtn.click();
    await page.waitForTimeout(400); // wait for confirm dialog mount animation (no observable end state)
  }
  await shot(page, 'confirm-delete-rule', {
    surface: 'templates',
    state: 'confirm-delete-rule',
    theme: 'light',
    userAction: 'user clicked Delete on a rule — danger-tone confirm dialog open',
    expectations: [
      'modal dialog mounts with a title referencing the rule',
      'primary Delete CTA uses the danger tone',
      'secondary Cancel reachable',
      'scrim covers the rules editor behind uniformly',
    ],
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200); // wait for dialog dismiss animation (no observable end state)
  await page.close();
});

test('Toast — success + error variants', async () => {
  test.slow();
  // Real user actions, not a direct sonner call: the options shell exposes no global to reach its module from `page.evaluate`.
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    onboardingDismissed: true,
  });
  const successPage = await ext.context.newPage();
  await successPage.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await successPage.waitForLoadState('networkidle');
  // Settings save silently by design — "Clear translation cache" is a real success-toast path.
  await openTemplatesWorkbench(successPage);
  await templateChip(successPage, 'global').click();
  await successPage.waitForTimeout(400); // wait for chip workbench mount animation (no observable end state)
  // No `.catch()` and no `if (count())`: a silenced wait ships a toast-less PNG under the toast name.
  await successPage.locator('[data-ega-clear-cache]').first().click();
  await successPage
    .locator('[data-sonner-toast][data-type="success"]')
    .first()
    .waitFor({ state: 'visible', timeout: 5_000 });
  await successPage.waitForTimeout(200); // wait for toast CSS entrance animation (no observable end state)
  await shot(successPage, 'toast-success', {
    surface: 'options',
    state: 'toast-success',
    theme: 'light',
    userAction:
      'user clicked "Clear translation cache" on the Templates workbench — success toast lands',
    expectations: [
      'sonner toast visible in its default corner',
      'success tone token applied (positive family)',
      'message text "Translation cache cleared." legible',
    ],
  });
  await successPage.close();

  // Pin anthropic and disable the rest, or the chain walks past the mocked 500 into a different failure mode.
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    onboardingDismissed: true,
    backendOrder: ['anthropic', 'openai', 'gemini', 'groq', 'deepseek', 'ollama', 'native'],
    disabledBackends: ['openai', 'gemini', 'groq', 'deepseek', 'ollama', 'native'],
    advanced: {
      promptTemplate: { system: 'You are a helpful translator.', user: '{{text}}' },
      perPresetTemplates: {},
      taskTemplates: {},
      rules: [],
      snippets: {},
      temperature: 0.2,
      maxTokens: 2048,
    },
  });
  await resetRoutes(ext.context);
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await route.fulfill({
      status: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { type: 'api_error', message: 'upstream exploded' } }),
    });
  });
  const errPage = await ext.context.newPage();
  await errPage.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await errPage.waitForLoadState('networkidle');
  await errPage.locator('[role="tab"]:has-text("Templates")').first().click();
  await errPage.waitForTimeout(300); // wait for tab panel CSS transition (no observable end state)
  await errPage.locator(`[data-ega-workbench-chip="rules"]`).first().click();
  await errPage.waitForTimeout(400); // wait for chip workbench mount animation (no observable end state)
  const describeInput = errPage.locator('[data-ega-describe-input]').first();
  await describeInput.fill('preserve emojis unchanged');
  await errPage.locator('[data-ega-describe-apply]').first().click();
  // `warning`, not `error`: the 500 falls back to a generic rule, so the save succeeds with a caveat.
  await errPage
    .locator('[data-sonner-toast][data-type="warning"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await errPage.waitForTimeout(200); // wait for toast CSS entrance animation (no observable end state)
  await shot(errPage, 'toast-error', {
    surface: 'options',
    state: 'toast-error',
    theme: 'light',
    userAction:
      'user dispatched describe-change against a 500 backend — warning toast surfaces the fallback',
    expectations: [
      'sonner toast visible in its default corner',
      'warning tone token applied (caution family, not danger)',
      'message says the text was saved as a rule because the model could not rewrite it',
    ],
  });
  await resetRoutes(ext.context);
  await errPage.close();
});

test('Page-translate v2 — bilingual + inplace + streaming + error-block', async () => {
  test.slow();
  await resetRoutes(ext.context);

  const V2_SEED_BASE = {
    anthropicApiKey: 'sk-test',
    streaming: true,
  };

  // Dispatch from the SW so the message passes the content script's sender checks.
  // The user picks the areas; the heading is pickable too.
  async function pickAndTranslate(page: Page): Promise<void> {
    await pickAreasAndTranslate(ext, page, ['heading', 'p1', 'p2']);
  }

  // ── Bilingual capture ────────────────────────────────────────────────────
  await seedSettings(ext.context, ext.extensionId, {
    ...V2_SEED_BASE,
    pageTranslateMode: 'bilingual' as const,
  });
  mockAnthropic(ext.context, { translation: 'Tokyo Tower is a landmark.', delayMs: 0 });

  const biPage = await ext.context.newPage();
  await biPage.goto(`${ext.serverUrl}/page-translate-v2-fixture.html`);
  await waitForTestHooks(biPage);
  await pickAndTranslate(biPage);
  await biPage
    .waitForFunction(() => document.querySelectorAll('[data-ega-tx]').length > 0, {
      timeout: 8_000,
      polling: 250,
    })
    .catch(() => undefined);
  await biPage
    .waitForFunction(
      () => {
        const els = document.querySelectorAll('[data-ega-tx]');
        if (els.length === 0) return false;
        return Array.from(els).every((el) => el.getAttribute('data-ega-tx-state') === 'ok');
      },
      { timeout: 12_000, polling: 250 },
    )
    .catch(() => undefined);
  await biPage.waitForTimeout(300); // wait for final render settle (no observable end state)
  await shot(biPage, 'page-translate-v2-bilingual', {
    surface: 'page-translate',
    state: 'v2-bilingual',
    theme: 'light',
    userAction:
      'user picked the heading and two paragraphs in bilingual mode; a translation sibling follows each',
    expectations: [
      'translation sibling block appears after each original Japanese paragraph',
      'siblings carry data-ega-tx attribute',
      'original paragraphs remain untouched above their translations',
      'no shimmer (…) placeholder remaining in completed blocks',
    ],
  });
  await biPage.close();
  await resetRoutes(ext.context);

  // ── In-place capture ────────────────────────────────────────────────────
  await seedSettings(ext.context, ext.extensionId, {
    ...V2_SEED_BASE,
    pageTranslateMode: 'inplace' as const,
  });
  mockAnthropic(ext.context, { translation: 'Tokyo Tower is a landmark.', delayMs: 0 });

  const inpPage = await ext.context.newPage();
  await inpPage.goto(`${ext.serverUrl}/page-translate-v2-fixture.html`);
  await waitForTestHooks(inpPage);
  await pickAndTranslate(inpPage);
  await inpPage
    .waitForFunction(
      () => {
        const els = document.querySelectorAll('[data-ega-replaced]');
        return (
          els.length > 0 &&
          Array.from(els).every((el) => el.getAttribute('data-ega-tx-state') === 'ok')
        );
      },
      { timeout: 12_000, polling: 250 },
    )
    .catch(() => undefined);
  await inpPage.waitForTimeout(300); // wait for final render settle (no observable end state)
  await shot(inpPage, 'page-translate-v2-inplace', {
    surface: 'page-translate',
    state: 'v2-inplace',
    theme: 'light',
    userAction:
      'user picked the heading and two paragraphs in in-place mode; each picked block is replaced',
    expectations: [
      'data-ega-replaced wrappers visible inside paragraph elements',
      'translation text fills the wrappers (no trailing …)',
      'no bilingual sibling rows inserted',
    ],
  });
  await inpPage.close();
  await resetRoutes(ext.context);

  // ── Streaming capture (mid-flight) ──────────────────────────────────────
  await seedSettings(ext.context, ext.extensionId, {
    ...V2_SEED_BASE,
    pageTranslateMode: 'bilingual' as const,
  });
  // Slow mock so at least one block is mid-stream when we screenshot.
  mockAnthropic(ext.context, { translation: 'Tokyo Tower is a landmark.', delayMs: 3_000 });

  const streamPage = await ext.context.newPage();
  await streamPage.goto(`${ext.serverUrl}/page-translate-v2-fixture.html`);
  await waitForTestHooks(streamPage);
  await pickAndTranslate(streamPage);
  await streamPage
    .waitForFunction(
      () => document.querySelectorAll('[data-ega-tx][data-ega-tx-state="streaming"]').length > 0,
      { timeout: 8_000, polling: 250 },
    )
    .catch(() => undefined);
  await streamPage.waitForTimeout(200); // wait for render settle mid-stream (no observable end state)
  await shot(streamPage, 'page-translate-v2-streaming', {
    surface: 'page-translate',
    state: 'v2-streaming',
    theme: 'light',
    userAction:
      'areas picked and fired; capture while bilingual siblings are mid-stream (SSE held)',
    expectations: [
      'at least one [data-ega-tx] sibling visible with streaming state',
      'sibling shows "…" placeholder or partial translation text',
      'original paragraph text still visible above the sibling',
    ],
  });
  await streamPage.close();
  await resetRoutes(ext.context);

  // ── Error-block capture ─────────────────────────────────────────────────
  await seedSettings(ext.context, ext.extensionId, {
    ...V2_SEED_BASE,
    pageTranslateMode: 'bilingual' as const,
  });
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await route.fulfill({
      status: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { type: 'api_error', message: 'upstream error' } }),
    });
  });

  const errBlockPage = await ext.context.newPage();
  await errBlockPage.goto(`${ext.serverUrl}/page-translate-v2-fixture.html`);
  await waitForTestHooks(errBlockPage);
  await pickAndTranslate(errBlockPage);
  await errBlockPage
    .waitForFunction(
      () => document.querySelectorAll('[data-ega-tx][data-ega-tx-state="error"]').length > 0,
      { timeout: 10_000, polling: 250 },
    )
    .catch(() => undefined);
  await errBlockPage.waitForTimeout(300); // wait for error block CSS entrance animation (no observable end state)
  await shot(errBlockPage, 'page-translate-v2-error-block', {
    surface: 'page-translate',
    state: 'v2-error-block',
    theme: 'light',
    userAction:
      'backend returned 500 for all blocks; v2 bilingual siblings show error state with retry button',
    expectations: [
      'sibling blocks show data-ega-tx-state="error"',
      'retry button (↻) visible inside error sibling',
      'error text or code visible in the sibling',
    ],
  });
  await errBlockPage.close();
  await resetRoutes(ext.context);
});
