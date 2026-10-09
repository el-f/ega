import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  customTask,
  launchExtension,
  seedCustomTasks,
  mockAnthropic,
  onlyBackends,
  openLanguageDialog,
  openLanguagePrompt,
  seedSettings,
  selectArabiziParagraph,
  sendImageTranslatePending,
  sendImageTranslateResult,
  waitForTestHooks,
  type ExtensionHandle,
  pickAreasAndTranslate,
  resetRoutes,
} from './helpers';
import {
  FOLLOW_FIXTURE_SCRIPT,
  NOW,
  SITE,
  T,
  WIDTHS,
  openExampleTab,
  openPanel,
  realMeta,
  reloadPanel,
  reply,
  seedConversations,
  user,
} from './sidepanel-audit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPaths } from '../../scripts/visual-judge/config';
import { checkDesignRules } from './design-rules';
import { SETTINGS_TABS } from '../../src/shared/settings-tabs';
import { DEFAULT_SETTINGS } from '../../src/shared/settings-defaults';
import type { ShotMeta } from '../../scripts/visual-judge/judge/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { currentDir: CURRENT_DIR, metaDir: META_DIR } = buildPaths(
  path.resolve(__dirname, '..', '..'),
);

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

// The headless mouse can default onto a nav-rail row and bake its hover tooltip into the shot.
async function parkCursor(page: Page): Promise<void> {
  await page.mouse.move(0, 900);
  await page.waitForTimeout(50); // wait for CSS transition (no observable end state)
}

/** The theme the tokens resolve to: the shadow host's data-theme, then the page's, then the media query. */
function renderedTheme(): 'light' | 'dark' {
  const host = document.querySelector<HTMLElement>('#ega-shadow-host');
  const set = host?.dataset['theme'] ?? document.documentElement.dataset['theme'];
  if (set === 'light' || set === 'dark') return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Writes the shot plus its `meta.json`; `surface` must name a rubric under `audit/rubric/`, or `unknown`. */
async function shot(
  page: Page,
  name: string,
  meta: Omit<ShotMeta, 'name'> = { surface: 'unknown', state: 'default' },
  opts: { skipPark?: boolean; viewportOnly?: boolean; overlay?: boolean | 'maybe' } = {},
): Promise<void> {
  // Picker shots skip this: the picker repaints its outline on every mousemove, so parking would re-outline (0, 900).
  if (!opts.skipPark) await parkCursor(page);
  // Resize before capture so popup shots stamp the real 380x600 chrome, not the 1200x800 launch canvas.
  if (meta.viewport) {
    await page.setViewportSize(meta.viewport);
    await page.waitForTimeout(80); // wait for layout reflow + popover position recompute (no observable end state)
  }
  // A theme leaked from a sibling test ships a dark PNG under a light sidecar; fail the capture instead.
  if (meta.theme) {
    await expect
      .poll(() => page.evaluate(renderedTheme), { message: `${name} declares ${meta.theme}` })
      .toBe(meta.theme);
  }
  // Scroll to top, or `fullPage` stamps `position: fixed` overlays at the current scroll offset instead of y=0.
  // A viewport shot keeps its scroll: it shows the part of the page the state is about.
  if (!opts.viewportOnly) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(50); // wait for fixed overlays to repaint at y=0 (no observable end state)
  }
  // A leaked popover shipped once in a baseline: an options shot names every overlay it expects.
  if ((meta.surface === 'options' || meta.surface === 'templates') && opts.overlay !== 'maybe') {
    const open = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[role="dialog"], [role="alertdialog"], [data-ega-infotip-text], [role="listbox"], [role="menu"]',
        ),
      ]
        .filter((el) => el.checkVisibility())
        .map((el) => el.getAttribute('aria-label') ?? el.getAttribute('role') ?? el.tagName),
    );
    if (opts.overlay && open.length === 0)
      throw new Error(`${name}: the overlay it shows is not open`);
    if (!opts.overlay && open.length > 0)
      throw new Error(
        `${name}: an overlay is open that the state does not name: ${open.join(', ')}`,
      );
  }
  const currentFile = path.join(CURRENT_DIR, `${name}.png`);
  await page.screenshot({ path: currentFile, fullPage: !opts.viewportOnly });
  const sidecar: ShotMeta = { name, ...meta };
  fs.writeFileSync(path.join(META_DIR, `${name}.meta.json`), JSON.stringify(sidecar, null, 2));
  // After the PNG is written, so a failing check still leaves the shot to look at.
  await checkDesignRules(page, name);
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

/** H-a: the theme is a setting, so the header toggle and the page agree; waits for the page to repaint. */
async function setThemeSetting(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate(async (t) => {
    const key = 'ega.settings';
    const cur = (await chrome.storage.local.get(key))[key] as Record<string, unknown> | undefined;
    await chrome.storage.local.set({ [key]: { ...cur, theme: t } });
  }, theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

// The card is the last on its tab and taller than the shell; a full-page shot is too small to judge it.
test('Right-click menu card — default, edit, states, many, narrow, delete (light + dark)', async () => {
  test.slow();
  const page = await ext.context.newPage();
  const card = page.locator('[data-ega-setting="contextMenu.items"]');
  const shipped = [
    'ega-translate-selection',
    'ega-sidepanel-selection',
    'ega-translate-image',
    'ega-explain-image',
    'ega-translate-page',
    'ega-pick-element',
    'ega-toggle-site',
  ];
  const base = (id: string, order: number): Record<string, unknown> => {
    const kind =
      order < 2
        ? 'task'
        : order < 4
          ? 'image-task'
          : (['page-translate', 'pick-element', 'site-toggle'][order - 4] ?? 'site-toggle');
    if (kind === 'task')
      return {
        id,
        kind,
        enabled: true,
        order,
        label: '',
        task: 'translate',
        surface: order === 1 ? 'sidepanel' : 'tooltip',
      };
    if (kind === 'image-task')
      return {
        id,
        kind,
        enabled: true,
        order,
        label: '',
        task: order === 3 ? 'explain' : 'translate',
        surface: 'sidepanel',
      };
    return { id, kind, enabled: true, order, label: '' };
  };
  const defaults = shipped.map((id, i) => base(id, i));

  async function openCard(patch: Record<string, unknown>): Promise<void> {
    await seedSettings(ext.context, ext.extensionId, {
      onboardingDismissed: true,
      contextMenuItems: defaults,
      disabledTasks: [],
      pickerEnabled: true,
      ...patch,
    });
    await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    await page.waitForLoadState('networkidle');
    await page.locator('#tab-selection-bubble').click();
    await card.waitFor({ state: 'visible', timeout: 8_000 });
  }

  async function cardShot(
    name: string,
    state: string,
    userAction: string,
    expectations: string[],
    viewport?: { width: number; height: number },
  ): Promise<void> {
    for (const theme of ['light', 'dark'] as const) {
      await setThemeSetting(page, theme);
      await parkCursor(page);
      await card.scrollIntoViewIfNeeded();
      const file = `right-click-menu-${name}${theme === 'dark' ? '-dark' : ''}`;
      await card.screenshot({ path: path.join(CURRENT_DIR, `${file}.png`) });
      const meta: ShotMeta = {
        name: file,
        surface: 'options',
        state: `right-click-menu-${state}`,
        theme,
        userAction,
        expectations,
        ...(viewport ? { viewport } : {}),
      };
      fs.writeFileSync(path.join(META_DIR, `${file}.meta.json`), JSON.stringify(meta, null, 2));
    }
    await setThemeSetting(page, 'light');
  }

  const ROW_RULES = [
    'one control row per menu row: checkbox, name, then Move up, Move down, Edit on the same line',
    "row text sits inside at most 2 borders, the card and its group box; a form field in an open row's options makes 3, and that is expected",
    'reasons, hints and group labels are at least 12 px and readable',
  ];

  await page.setViewportSize({ width: 1200, height: 900 });
  await openCard({});
  await cardShot(
    'default',
    'default',
    'user opened Selection and picker and scrolled to the Right-click menu card',
    [
      'three groups: Selected text, Images, Page, each box starting with "Ega ▸"',
      'automatic names, none ending in "with Ega"; no Layout control; Reset hidden',
      'the "Disable Ega on this site" row has no Edit, and its arrows line up with the arrows above',
      ...ROW_RULES,
    ],
  );

  await card.getByRole('button', { name: 'About the right-click menu' }).click();
  await expect(page.locator('[data-ega-infotip-text]')).toBeVisible();
  await cardShot('infotip', 'infotip', 'user clicked the (i) next to the card title', [
    'the tip opens under the (i), over the card, with the two sentences about the menu',
    'its text is at least 12 px and reads clearly against its background',
  ]);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ega-infotip-text]')).toHaveCount(0);

  // Tab from the checkbox, so the browser draws the keyboard focus ring.
  const focusRow = card.locator('[data-ega-cm-id="ega-sidepanel-selection"]');
  await focusRow.locator('[data-ega-cm-enabled]').focus();
  await page.keyboard.press('Tab');
  await expect(focusRow.locator('[data-ega-cm-edit]')).toBeFocused();
  await cardShot(
    'focus',
    'focus',
    'user tabbed from the "Translate in side panel" checkbox to its row actions',
    ["a clear focus ring around that row's Edit button, and on no other control", ...ROW_RULES],
  );

  await card.locator('[data-ega-cm-id="ega-translate-selection"] [data-ega-cm-edit]').click();
  await expect(
    card.locator('[data-ega-cm-id="ega-translate-selection"] [data-ega-cm-options]'),
  ).toBeVisible();
  await cardShot('edit', 'edit', 'user pressed Edit on the Translate row', [
    'the options open under the row: Task, Opens in, Answer in, Name in menu, one label column',
    'Edit shows an up chevron and the row is tinted',
    ...ROW_RULES,
  ]);

  const added = {
    id: 'ega-custom-txt-tt-7',
    kind: 'task',
    enabled: true,
    order: 2,
    label: '',
    task: 'summarize',
    surface: 'tooltip',
  };
  await openCard({
    contextMenuItems: [
      defaults[0],
      { ...defaults[1], enabled: false },
      added,
      ...defaults.slice(2).map((d) => ({ ...d, order: (d['order'] as number) + 1 })),
    ],
    disabledTasks: ['explain'],
    pickerEnabled: false,
  });
  await expect(card.locator('[data-ega-cm-status]').first()).toBeVisible();
  await cardShot(
    'states',
    'states',
    'user hid one row, turned Explain off in Tasks and the element picker off',
    [
      '"Hidden", "Hidden: Explain is off in Tasks" and "Hidden: the element picker is off" in secondary text under the names',
      'hidden names are in the secondary colour; the added Summarize row reads "Summarize"',
      'Reset section shows in the header',
      ...ROW_RULES,
    ],
  );

  const many = Array.from({ length: 12 }, (_, n) => ({
    ...added,
    id: `ega-custom-txt-tt-${20 + n}`,
    order: 20 + n,
    task: ['summarize', 'explain', 'reword', 'grammar'][n % 4],
  }));
  await openCard({ contextMenuItems: [...defaults, ...many] });
  await expect(card.locator('[data-ega-cm-long]')).toBeVisible();
  await cardShot('many', 'many', 'user added 12 text actions', [
    'the long-group note under Selected text: "Long menus are slow to scan. Hide the items you rarely use."',
    'rows keep one line each; nothing overlaps',
    ...ROW_RULES,
  ]);

  // At the 50-row cap both Add buttons say why they do nothing, in visible text.
  const full = Array.from({ length: 43 }, (_, n) => ({
    ...added,
    id: `ega-custom-txt-tt-${40 + n}`,
    order: 40 + n,
  }));
  await openCard({ contextMenuItems: [...defaults, ...full] });
  await expect(card.locator('[data-ega-cm-full]')).toHaveCount(1);
  await expect(card.locator('[data-ega-cm-add]').first()).toHaveAttribute('aria-disabled', 'true');
  await cardShot('full', 'full', 'user has 50 items, the most the menu holds', [
    'both Add buttons are dimmed, and one line says "Menu is full (50 items). Delete one to add another."',
    ...ROW_RULES,
  ]);

  // A second Translate row like the first: its form warns, without blocking.
  const twin = { ...defaults[0], id: 'ega-custom-txt-tt-9', order: 2 };
  await openCard({
    contextMenuItems: [
      defaults[0],
      defaults[1],
      twin,
      ...defaults.slice(2).map((d) => ({ ...d, order: (d['order'] as number) + 1 })),
    ],
  });
  await card.locator(`[data-ega-cm-id="${twin.id}"] [data-ega-cm-edit]`).click();
  await expect(card.locator('[data-ega-cm-twin]')).toBeVisible();
  await cardShot(
    'duplicate-warning',
    'duplicate-warning',
    'user opened a Translate row that matches the one above',
    ['"Same as "Translate" above" in the open form; nothing is blocked', ...ROW_RULES],
  );

  // A task of your own in the menu reads by its own name.
  await seedCustomTasks(ext.context, ext.extensionId, [customTask()]);
  await openCard({
    contextMenuItems: [
      defaults[0],
      { ...added, id: 'ega-custom-txt-tt-8', task: 'c-tweet' },
      ...defaults.slice(1).map((d) => ({ ...d, order: (d['order'] as number) + 1 })),
    ],
  });
  await expect(card.getByText('Tweet summary').first()).toBeVisible();
  await cardShot(
    'custom-task-item',
    'custom-task-item',
    'user added their Tweet summary task to the menu',
    ['the row reads "Tweet summary", in line with the built-in rows', ...ROW_RULES],
  );
  await seedCustomTasks(ext.context, ext.extensionId, []);

  await openCard({});
  await card.locator('[data-ega-cm-id="ega-translate-page"] [data-ega-cm-edit]').click();
  await expect(
    card.locator('[data-ega-cm-id="ega-translate-page"] [data-ega-cm-options]'),
  ).toBeVisible();
  await cardShot('page-item-edit', 'page-item-edit', 'user pressed Edit on Translate this page', [
    'the page row shows only the options it has; labels in one column',
    ...ROW_RULES,
  ]);
  await card.locator('[data-ega-cm-id="ega-translate-page"] [data-ega-cm-edit]').click();
  await card.locator('[data-ega-cm-id="ega-explain-image"] [data-ega-cm-edit]').click();
  await expect(card.locator('[data-ega-cm-image-lang]')).toBeVisible();
  await cardShot(
    'image-item-edit',
    'image-item-edit',
    'user pressed Edit on Explain image in side panel',
    [
      '"Image actions answer in your default target language" in place of a language picker',
      ...ROW_RULES,
    ],
  );

  // Reset puts the shipped rows back and offers Undo.
  await openCard({
    contextMenuItems: [defaults[0], { ...defaults[1], enabled: false }, ...defaults.slice(2)],
  });
  await card.locator('[data-ega-section-reset]').click();
  await page.locator('[data-sonner-toast]').first().waitFor({ state: 'visible', timeout: 5_000 });
  for (const theme of ['light', 'dark'] as const) {
    await setThemeSetting(page, theme);
    await shot(page, `right-click-menu-reset-result${theme === 'dark' ? '-dark' : ''}`, {
      surface: 'options',
      state: 'right-click-menu-reset-result',
      theme,
      userAction: 'user pressed Reset section on the right-click menu card',
      expectations: [
        'every row back as shipped; a toast says the menu is back to defaults, with Undo',
      ],
    });
  }
  await setThemeSetting(page, 'light');

  await page.setViewportSize({ width: 400, height: 900 });
  await openCard({});
  await card.locator('[data-ega-cm-id="ega-translate-image"] [data-ega-cm-edit]').click();
  await cardShot(
    'narrow',
    'narrow',
    'user opened the card at a 400 px wide options page and pressed Edit on an image row',
    [
      'row actions stay on the name line; long names wrap, never cut off',
      'no drag grip and no kind icon at this width; each row starts with its checkbox',
      'in the open options each label sits above its control',
      ...ROW_RULES,
    ],
    { width: 400, height: 900 },
  );
  await page.setViewportSize({ width: 1200, height: 900 });

  await openCard({ contextMenuItems: [...defaults, added] });
  const row = card.locator(`[data-ega-cm-id="${added.id}"]`);
  await row.locator('[data-ega-cm-edit]').click();
  await row.locator('[data-ega-cm-delete]').click();
  await page.locator('[data-sonner-toast]').first().waitFor({ state: 'visible', timeout: 5_000 });
  await page.waitForTimeout(200); // wait for toast CSS entrance animation (no observable end state)
  for (const theme of ['light', 'dark'] as const) {
    await setThemeSetting(page, theme);
    await shot(page, `right-click-menu-delete-toast${theme === 'dark' ? '-dark' : ''}`, {
      surface: 'options',
      state: 'right-click-menu-delete-toast',
      theme,
      userAction: 'user deleted the Summarize action they had added',
      expectations: [
        'toast "Removed "Summarize"." with Undo',
        'the row is gone from Selected text',
      ],
    });
  }
  await setThemeSetting(page, 'light');

  // Leave the shared profile as shipped for the tests that follow.
  await seedSettings(ext.context, ext.extensionId, {
    contextMenuItems: defaults,
    disabledTasks: [],
    pickerEnabled: true,
  });
  await page.close();
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

// Light and dark default shots share one body so the two can be diffed for theme parity.
const TOOLTIP_DEFAULT_ANSWER = { translation: 'Welcome! How are you doing?', confidence: 0.92 };

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
  mockAnthropic(ext.context, TOOLTIP_DEFAULT_ANSWER);
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

  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'About this reply' }).click();
  await expect(page.locator('[data-ega-inspector]')).toBeVisible();
  await shot(page, 'tooltip-inspector-open', {
    surface: 'tooltip',
    state: 'inspector-open',
    theme: 'light',
    userAction: 'user selected More > About this reply',
    expectations: [
      'About this reply panel mounts below the body',
      'answered by, time and what was sent visible',
    ],
  });

  // Toggle context preview open.
  await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const btn = root?.querySelector<HTMLButtonElement>(
      '.tooltip [data-ega-inspector] .rd-link[aria-expanded]',
    );
    btn?.click();
  });
  await page.waitForTimeout(400); // wait for context-preview expand animation (no observable end state)
  await shot(page, 'tooltip-context-preview', {
    surface: 'tooltip',
    state: 'context-preview',
    theme: 'light',
    userAction: 'user opened Show all page info in the details panel',
    expectations: ['every page field listed', 'panel scrolls inside the tooltip cap'],
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
  await loadingPage.waitForFunction(
    () => {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      return !!root?.querySelector('.tooltip .shimmer');
    },
    { timeout: 5_000, polling: 250 },
  );
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
  await errPage.waitForFunction(
    () => {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      return !!root?.querySelector('.tooltip [data-ega-retry]');
    },
    { timeout: 10_000, polling: 250 },
  );
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
  await mvPage.waitForFunction(
    () => {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      return !!root
        ?.querySelector('.tooltip [data-ega-meta-item="direction"]')
        ?.textContent.includes('+');
    },
    { timeout: 10_000, polling: 250 },
  );
  await mvPage.waitForTimeout(300); // wait for chip cluster CSS entrance animation (no observable end state)
  await shot(mvPage, 'tooltip-multi-variety', {
    surface: 'tooltip',
    state: 'multi-variety',
    theme: 'light',
    userAction: 'detector returned multiple languages; the shared metadata line names them',
    expectations: ['mixed source languages in one metadata line', 'the direction is legible'],
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
  mockAnthropic(ext.context, TOOLTIP_DEFAULT_ANSWER);
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
  await bubble.waitForFunction(
    () => {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      return !!root?.querySelector('.bubble');
    },
    { timeout: 5_000, polling: 250 },
  );
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

  // A slow mock holds the SSEs open, so the in-flight states are on screen even though the batch driver runs in parallel.
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
  // Intentional pause inside the 2.5s mock delay — captures the blocks mid-flight.
  await progressPage.waitForTimeout(800); // wait for mid-flight batch state (no observable "mid-stream" DOM condition)
  await shot(progressPage, 'page-translate-progress', {
    surface: 'page-translate',
    state: 'progress',
    theme: 'light',
    userAction: 'user picked two areas and hit Translate; capture while blocks are mid-flight',
    expectations: [
      'multiple paragraph wrappers visible',
      'at least one wrapper still shows the … placeholder, which pulses while in flight',
      'wrappers only around the two areas the user picked',
    ],
  });
  // Wrappers are inserted before any chunk lands, so a count check alone ticks true on the `…` placeholder.
  await progressPage.waitForFunction(
    () => {
      const wraps = Array.from(document.querySelectorAll('[data-ega-replaced]'));
      if (wraps.length < 2) return false;
      return wraps.every((w) => w.getAttribute('data-ega-tx-state') === 'ok');
    },
    // Interval polling, not rAF: a throttled page never runs the rAF callback that enforces the timeout.
    { timeout: 15_000, polling: 250 },
  );
  await shot(progressPage, 'page-translate-done', {
    surface: 'page-translate',
    state: 'done',
    theme: 'light',
    userAction: 'all batches resolved; every wrapper committed its translated text',
    expectations: [
      'every wrapper shows translated text (no trailing …)',
      'no wrapper still pulses',
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
      'a small spinning ring sits right after the dimmed original',
      'rest of the page untouched',
    ],
  });
  await inlinePage.waitForFunction(
    () => {
      const w = document.querySelector('[data-ega-replaced]');
      return !!w && !w.hasAttribute('data-ega-pending') && w.textContent.includes('TRANSLATED');
    },
    { timeout: 10_000, polling: 250 },
  );
  await shot(inlinePage, 'inline-replace-done-hint', {
    surface: 'page-translate',
    state: 'inline-replace-done-hint',
    theme: 'light',
    userAction: 'first inline replace on this install finished',
    expectations: [
      'the wrapper shows the translated text, no spinner',
      'a toast at the bottom says to press Esc twice to put the original back, with an Undo button',
    ],
  });
  await inlinePage.close();
  await resetRoutes(ext.context);
});

test('Smart-bubble — digit-less + short-suppressed + dark', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    bubbleMode: 'smart',
    sitePrefs: {},
    // A suppressed selection raises the one-time smart-mode notice; it gets its own shot below.
    smartBubbleBannerShown: true,
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
  await digitless.waitForFunction(
    () => {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      return !!root?.querySelector('.bubble');
    },
    { timeout: 5_000, polling: 250 },
  );
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

  // A selection shorter than DEFAULT_SMART_BUBBLE_MIN_LENGTH must not mount the bubble.
  const shortPage = await ext.context.newPage();
  await shortPage.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(shortPage);
  await shortPage.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'below-min-length';
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
  await shot(shortPage, 'smart-bubble-below-min-length-suppressed', {
    surface: 'smart-bubble',
    state: 'below-min-length-suppressed',
    theme: 'light',
    userAction:
      'user selected a 2-character string, below the minimum length; smart bubble must NOT mount',
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
  await darkBubble.waitForFunction(
    () => {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      return !!root?.querySelector('.bubble');
    },
    { timeout: 5_000, polling: 250 },
  );
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
  await loadingDark.waitForFunction(
    () => {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      return !!root?.querySelector('.tooltip .shimmer');
    },
    { timeout: 5_000, polling: 250 },
  );
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
  await page.waitForFunction(
    () => {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      return !!root?.querySelector('.tooltip .tooltip-error-body');
    },
    { timeout: 10_000, polling: 250 },
  );
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

test('Toast — success', async () => {
  test.slow();
  // Real user actions, not a direct sonner call: the options shell exposes no global to reach its module from `page.evaluate`.
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    onboardingDismissed: true,
    taskOverrides: { summarize: { effort: 'high' } },
  });
  const successPage = await ext.context.newPage();
  await successPage.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await successPage.waitForLoadState('networkidle');
  // Settings save silently by design — resetting an edited task is a real success-toast path.
  await successPage.locator('#tab-tasks').click();
  await successPage.locator('[data-ega-task-edit="summarize"]').click();
  // No `.catch()` and no `if (count())`: a silenced wait ships a toast-less PNG under the toast name.
  // Reset acts in the dialog; closing it with no Undo repeats the Undo in a toast.
  await successPage.locator('[data-ega-section-reset]').click();
  await successPage.locator('[data-ega-dialog-done]').click();
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
      'user reset the edited Summarize task on the Tasks tab — success toast lands with Undo',
    expectations: [
      'sonner toast visible in its default corner',
      'success tone token applied (positive family)',
      'message text "Summarize is back to built-in" legible, with an Undo action',
    ],
  });
  await successPage.close();
});

// The danger CTA is the one place the dark theme's dark --color-accent-fg sits on red, so it is shot in dark.
test('Confirm dialog — delete all data (dark)', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    onboardingDismissed: true,
    theme: 'dark',
  });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');
  await page.locator('#tab-about').click();
  await page.getByRole('button', { name: 'Delete all data' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#confirm-input').fill('DELETE');
  await expect(dialog.getByRole('button', { name: 'Delete all data' })).toBeEnabled();
  await applyThemeOnPage(page, 'dark');
  await page.waitForTimeout(200); // wait for dialog entrance animation (no observable end state)
  await shot(page, 'confirm-delete-all-data-dark', {
    surface: 'options',
    state: 'confirm-delete-all-data',
    theme: 'dark',
    userAction:
      'user clicked Delete all data on the About tab and typed DELETE — danger confirm dialog open',
    expectations: [
      'modal dialog titled "Delete all data" with the list of what gets deleted',
      'type-to-confirm field holds DELETE',
      'Delete all data CTA uses the danger tone and is enabled, its label readable dark text on red',
      'secondary Cancel reachable',
      'scrim covers the About tab behind it',
    ],
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.close();
  // One shared context: leaving `theme: 'dark'` seeded would stamp the next shots dark.
  await seedSettings(ext.context, ext.extensionId, { theme: 'light' });
});

test('Page-translate v2 — bilingual + inplace + streaming + error-block', async () => {
  test.slow();
  await resetRoutes(ext.context);

  // Seeded here, not inherited from earlier tests: a lone `-g` run must also stop the 500 at anthropic.
  const V2_SEED_BASE = {
    anthropicApiKey: 'sk-test',
    streaming: true,
    cacheEnabled: false,
    ...onlyBackends('anthropic'),
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
  await biPage.waitForFunction(() => document.querySelectorAll('[data-ega-tx]').length > 0, {
    timeout: 8_000,
    polling: 250,
  });
  await biPage.waitForFunction(
    () => {
      const els = document.querySelectorAll('[data-ega-tx]');
      if (els.length === 0) return false;
      return Array.from(els).every((el) => el.getAttribute('data-ega-tx-state') === 'ok');
    },
    { timeout: 12_000, polling: 250 },
  );
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
  await inpPage.waitForFunction(
    () => {
      const els = document.querySelectorAll('[data-ega-replaced]');
      return (
        els.length > 0 &&
        Array.from(els).every((el) => el.getAttribute('data-ega-tx-state') === 'ok')
      );
    },
    { timeout: 12_000, polling: 250 },
  );
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
  await streamPage.waitForFunction(
    () => document.querySelectorAll('[data-ega-tx][data-ega-tx-state="streaming"]').length > 0,
    { timeout: 8_000, polling: 250 },
  );
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
  await errBlockPage.waitForFunction(
    () => document.querySelectorAll('[data-ega-tx][data-ega-tx-state="error"]').length > 0,
    { timeout: 10_000, polling: 250 },
  );
  await errBlockPage.waitForTimeout(300); // wait for error block CSS entrance animation (no observable end state)
  await shot(errBlockPage, 'page-translate-v2-error-block', {
    surface: 'page-translate',
    state: 'v2-error-block',
    theme: 'light',
    userAction: 'backend returned 500 for all blocks; v2 bilingual siblings show the error state',
    expectations: [
      'sibling blocks show data-ega-tx-state="error"',
      'retry button (↻) always visible next to the error chip',
      'error text or code visible in the sibling',
    ],
  });
  await errBlockPage.close();
  await resetRoutes(ext.context);
});

// ── Side panel (redesign spec §13.1): every state at 400, 320 and 320 at 125 % zoom, light and dark ──

const PANEL_SEED = {
  anthropicApiKey: 'sk-test',
  streaming: true,
  captureResultMeta: true,
  confidencePill: true,
  confidencePillThreshold: 0,
  contextEnabled: true,
  pageContextLevel: 'minimal' as const,
  theme: 'light' as const,
};

interface MatrixOpts {
  /** Runs before each capture, for states a resize or a theme switch closes (menus, hover). */
  perShot?: (sp: Page) => Promise<void>;
  /** A hover state: the pointer stays where perShot put it. Every other shot parks it, so no stray tooltip shows. */
  hover?: boolean;
  /** The composer keeps focus (the "focused" states). */
  keepFocus?: boolean;
  widths?: readonly (typeof WIDTHS)[number][];
  themes?: readonly ('light' | 'dark')[];
}

/** Captures one state at every width and theme, named sidepanel-{state}-{w}-{theme}. */
async function matrix(
  sp: Page,
  state: string,
  userAction: string,
  expectations: string[],
  opts: MatrixOpts = {},
): Promise<void> {
  for (const theme of opts.themes ?? (['light', 'dark'] as const)) {
    await applyThemeOnPage(sp, theme);
    for (const w of opts.widths ?? WIDTHS) {
      await sp.setViewportSize(w.viewport);
      await sp.waitForTimeout(80); // wait for layout and popover reposition (no observable end state)
      if (opts.perShot) await opts.perShot(sp);
      if (!opts.keepFocus) {
        await sp.evaluate(() => {
          if (document.activeElement?.id === 'sp-text')
            (document.activeElement as HTMLElement).blur();
        });
      }
      await shot(
        sp,
        `sidepanel-${state}-${w.tag}-${theme}`,
        {
          surface: 'sidepanel',
          state,
          theme,
          viewport: w.viewport,
          userAction: `${userAction} (${w.at})`,
          expectations,
        },
        opts.hover ? { skipPark: true } : {},
      );
    }
  }
  await applyThemeOnPage(sp, 'light');
}

async function panelWith(conversations: Parameters<typeof seedConversations>[1]): Promise<Page> {
  const sp = await openPanel(ext.context, ext.extensionId);
  await seedConversations(sp, conversations);
  await reloadPanel(sp);
  return sp;
}

async function openReplyMenu(sp: Page, action: 'refine' | 'more'): Promise<void> {
  const trigger = sp.locator(`[data-ega-reply]`).last().locator(`[data-ega-action="${action}"]`);
  if ((await trigger.getAttribute('aria-expanded')) === 'true') return;
  await trigger.click();
  await sp.locator('[role="menu"]').waitFor({ state: 'visible' });
}

const FIRST_PAIR = [user('u1', 'hola', T(28)), reply('a1', 'u1', T(28))];

test.describe('Sidepanel redesign', () => {
  test.beforeAll(async () => {
    await ext.context.addInitScript(FOLLOW_FIXTURE_SCRIPT);
    await openExampleTab(ext.context);
    await seedSettings(ext.context, ext.extensionId, PANEL_SEED);
  });

  test('Sidepanel — empty and first exchange', async () => {
    test.setTimeout(360_000);
    const sp = await panelWith([]);
    await matrix(
      sp,
      'empty-focused',
      'user opened the panel on example.com with no conversation',
      [
        'one line and three suggestion buttons, no help paragraph',
        'header: site title, backend chip, More; no New or Search',
        'composer: mode chip, input with Add and Send, focused',
      ],
      { keepFocus: true },
    );
    await sp.locator('[data-ega-suggestion="translate-selection"]').click();
    await expect(sp.locator('.ega-empty-status')).not.toHaveText('');
    await matrix(
      sp,
      'empty-no-selection',
      'user pressed Translate selection with nothing selected',
      ['one status line under the buttons says to select text first'],
    );
    await sp.close();

    const pair = await panelWith([{ id: SITE, turns: FIRST_PAIR }]);
    await matrix(pair, 'first-exchange', 'one message and its answer, Spanish to English', [
      'day separator "Today 14:02" over the thread',
      'neutral grey bubble holding only the text',
      'answer first, then one meta line (Spanish → English · Claude Haiku 4.5 · 93% confident), then one row of 4 icons',
    ]);
    await matrix(
      pair,
      'first-exchange-hover-user',
      'pointer on the user bubble',
      ['a raised toolbar (Copy, Edit, More) floats over the bubble top edge; nothing moved'],
      {
        hover: true,
        perShot: async (p) => {
          await p.locator('[data-ega-user-bubble]').first().hover();
          await p.waitForTimeout(200); // wait for the 120ms fade (no observable end state)
        },
      },
    );
    await pair.close();
  });

  test('Sidepanel — no backend', async () => {
    test.setTimeout(360_000);
    await seedSettings(ext.context, ext.extensionId, {
      anthropicApiKey: '',
      disabledBackends: ['native', 'ollama', 'localserver'],
    });
    const sp = await panelWith([]);
    await expect(sp.locator('[data-ega-sidepanel-empty]')).toContainText(
      'Set up a backend to start',
    );
    await matrix(sp, 'empty-no-backend', 'first run with no backend', [
      'one primary "Set up a backend" button; header chip reads "Set up backend" in warning style',
    ]);
    await sp.close();
    await seedSettings(ext.context, ext.extensionId, {
      ...PANEL_SEED,
      disabledBackends: DEFAULT_SETTINGS.disabledBackends,
    });
  });

  test('Sidepanel — long thread', async () => {
    test.setTimeout(360_000);
    const turns: Record<string, unknown>[] = [];
    for (let i = 0; i < 34; i++) {
      // Three days, so the loaded window opens on a new day ("Yesterday") and "Today" comes further down.
      const at = i < 5 ? T(60 * 48 + 200 - i) : i < 20 ? T(60 * 24 + 200 - i) : T(120 - i);
      turns.push(user(`u${i}`, `mensaje número ${i}`, at));
      turns.push(reply(`a${i}`, `u${i}`, at, { content: `Message number ${i}.` }));
    }
    turns.push(
      user(
        'ul',
        'Explícame este código y el enlace https://example.com/a/very/long/path/that/keeps/going/and/going/without/a/break',
        T(5),
        {
          kind: 'explain',
          trimmedTo: 2000,
        },
      ),
      reply('al', 'ul', T(5), {
        kind: 'explain',
        content:
          '## What it does\n\n- Reads the list\n- Sorts it by date\n\n```ts\nconst sorted = items.sort((a, b) => a.date - b.date);\n```\n\n| Step | Result |\n| --- | --- |\n| 1 | read |\n| 2 | sort |\n\nThe link points to https://example.com/a/very/long/path/that/keeps/going/and/going/without/a/break',
        explain: 'The code is TypeScript; `sort` changes the list in place.',
      }),
    );
    const sp = await panelWith([{ id: SITE, turns }]);
    await sp.locator('[data-ega-show-earlier]').waitFor({ state: 'visible' });
    await matrix(
      sp,
      'long-thread-top',
      '70 turns, scrolled to the top of the loaded window',
      [
        '"Show 10 earlier messages" at the top, then the "Yesterday" day separator',
        'older replies hide their action row (28px kept); a "Jump to latest" pill shows',
      ],
      {
        perShot: async (p) => {
          await p.locator('.ega-conv-stream').evaluate((el) => (el.scrollTop = 0));
          await p.locator('[data-ega-jump-latest]').waitFor({ state: 'visible' });
        },
      },
    );
    await matrix(
      sp,
      'long-thread-end',
      '70 turns, the last pair (an Explain) scrolled to the top',
      [
        'a day separator and the "Explain" task label over the long message, which notes it was cut',
        'the Markdown answer: list, code block, table and long URL stay inside the column',
        'notes, then one meta line and one action row',
      ],
      {
        perShot: async (p) => {
          await p
            .locator('[data-ega-day-separator]')
            .last()
            .evaluate((el) => {
              el.scrollIntoView({ block: 'start' });
              // scrollIntoView ignores the separator's own top margin; keep it off the header's edge.
              el.closest('.ega-conv-stream')?.scrollBy(0, -16);
            });
        },
      },
    );
    await sp.close();
  });

  test('Sidepanel — reply shapes', async () => {
    test.setTimeout(360_000);
    const sp = await panelWith([
      {
        id: SITE,
        turns: [
          user('u1', 'mar7aba, kifak?', T(30), { kind: 'explain' }),
          reply('a1', 'u1', T(30), {
            kind: 'explain',
            content: '"Mar7aba" is Arabizi for "hello"; "kifak" asks "how are you" (to a man).',
            explain:
              'Levantine Arabic written in Latin letters, with digits for sounds Latin lacks.',
            detectedLang: 'arabizi',
            detectedDetail: 'Levantine',
          }),
        ],
      },
    ]);
    await matrix(sp, 'explain-notes', 'an Explain answer with notes', [
      'notes label in sentence case, notes text muted with one 2px rule',
      'meta line: Arabizi (Levantine) → English',
    ]);
    await sp.close();

    const meta = await panelWith([
      {
        id: SITE,
        turns: [
          user('u1', 'yalla bye', T(40)),
          reply('a1', 'u1', T(40), {
            content: 'Come on, bye.',
            detectedLangs: [{ id: 'arabizi', detail: 'Levantine' }, { id: 'en' }],
            detectedLang: 'arabizi',
          }),
          user('u2', 'que onda', T(35)),
          reply('a2', 'u2', T(35), { content: "What's up.", confidence: 0.42 }),
          user('u3', 'merci beaucoup', T(30)),
          reply('a3', 'u3', T(30), {
            content: 'Thank you very much.',
            detectedLang: 'fr',
            meta: realMeta({
              backendId: 'gemini',
              modelId: 'gemini-2.5-flash',
              attempts: [
                { backendId: 'anthropic', status: 'error', code: 'SERVER', latencyMs: 800 },
                { backendId: 'gemini', status: 'ok', latencyMs: 900 },
              ],
            }),
          }),
          user('u4', 'hola', T(25)),
          reply('a4', 'u4', T(25), { meta: realMeta({ cacheHit: true }), bookmarked: true }),
          user('u5', 'yalla bye habibi', T(22), {
            dispatch: { sourceLang: 'auto', targetLang: 'zh-TW', stream: true },
          }),
          reply('a5', 'u5', T(22), {
            content: '走吧，再見。',
            detectedLangs: [{ id: 'arabizi', detail: 'Levantine' }, { id: 'en' }],
            detectedLang: 'arabizi',
            meta: realMeta({ targetLang: 'zh-TW' }),
          }),
        ],
      },
    ]);
    await matrix(
      meta,
      'meta-variants',
      'replies with mixed languages, low confidence, a fallback and a cache hit',
      [
        'every meta line is one line; items that do not fit drop whole, confidence first',
        'a direction wider than the reply is left out whole (never its first words, a cut word or an ellipsis); shorter items after it still show',
        '"Low confidence (42%)" in the warning colour',
        '"Answered by Gemini · Anthropic failed"; "Saved answer" for the cache hit',
      ],
    );
    await meta.close();

    const versions = await panelWith([
      {
        id: SITE,
        turns: [
          user('u1', 'como estas', T(20)),
          reply('a1', 'u1', T(20), {
            content: 'How are you doing?',
            variants: [
              {
                id: 'a1:v1',
                status: 'done',
                content: 'How are you?',
                confidence: 0.9,
                meta: realMeta(),
              },
              {
                id: 'a1:v2',
                status: 'done',
                content: 'How are you doing?',
                refinementBody: 'Make outputs shorter.',
                refinementLabel: 'Shorter',
                confidence: 0.9,
                meta: realMeta(),
              },
            ],
            activeVariantIdx: 1,
          }),
        ],
      },
    ]);
    // Version 3 is asked for and hangs, then the reader steps back to version 2 while it runs.
    await ext.context.route('https://api.anthropic.com/v1/messages', () => undefined);
    await openReplyMenu(versions, 'refine');
    await versions.locator('[data-ega-refine-preset="less-formal"]').click();
    await versions.locator('.ega-pager-count', { hasText: '3/3' }).waitFor({ state: 'visible' });
    await versions.locator('[data-ega-variant-prev]').click();
    await versions.locator('.ega-pager-count', { hasText: '2/3' }).waitFor({ state: 'visible' });
    // Focus stays on the arrow (its own state); this one is the pager, not a focused button with its label.
    await versions.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await matrix(versions, 'versions', 'three versions, version 3 still loading behind version 2', [
      'pager "2/3" at the end of the action row; meta line says "Version 3 loading…" and names "Shorter"',
    ]);
    await openReplyMenu(versions, 'refine');
    await versions.locator('[data-ega-show-changes]').click();
    await matrix(
      versions,
      'refined-show-changes',
      'Show changes turned on for the refined version',
      ['word diff inline: added underlined, removed struck through'],
    );
    await versions.close();
    await resetRoutes(ext.context);
    await openExampleTab(ext.context);

    const rtl = await panelWith([
      {
        id: SITE,
        turns: [
          user('u1', 'שלום, מה שלומך?', T(10), {
            dispatch: { sourceLang: 'auto', targetLang: 'ar', stream: true },
          }),
          reply('a1', 'u1', T(10), {
            content: 'مرحبا، كيف حالك؟',
            detectedLang: 'he',
            meta: realMeta({ targetLang: 'ar' }),
          }),
        ],
      },
    ]);
    await matrix(rtl, 'rtl', 'Hebrew message, Arabic answer', [
      'bubble and answer right-aligned by their own text; meta and buttons stay LTR',
    ]);
    await rtl.close();

    const PNG =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAJ0lEQVR4nO3BMQEAAADCoPVPbQhfoAAAAAAAAAAAAAAAAAAAAPwGJiAAAQeKWUoAAAAASUVORK5CYII=';
    const images = await panelWith([
      {
        id: SITE,
        turns: [
          user('u1', '[image]', T(15), { kind: 'image-translate', imageDataUrl: PNG }),
          reply('a1', 'u1', T(15), {
            kind: 'image-translate',
            content: 'Exit only',
            detectedLang: 'de',
          }),
          user('u2', '[image]', T(12), { kind: 'image-translate', imageShed: true }),
          reply('a2', 'u2', T(12), {
            kind: 'image-translate',
            content: 'Open daily',
            detectedLang: 'de',
          }),
          // Spec §13.1: Explain with an image and a typed note, kept and shed.
          user('u3', 'what does the small print mean?', T(10), {
            kind: 'explain',
            imageDataUrl: PNG,
          }),
          reply('a3', 'u3', T(10), {
            kind: 'explain',
            content: 'It says the exit is for staff only.',
            explain: 'The small print is a fire-code notice.',
            detectedLang: 'de',
          }),
          user('u4', 'and this one?', T(9), { kind: 'explain', imageShed: true }),
          reply('a4', 'u4', T(9), {
            kind: 'explain',
            content: 'It gives the opening hours.',
            detectedLang: 'de',
          }),
        ],
      },
    ]);
    await matrix(
      images,
      'image-turns',
      'image messages (Translate and Explain with a typed note), images no longer kept, their answers',
      [
        'image preview inside the bubble; "Image not shown" for a removed one',
        'Explain with an image: the "Explain" label, the preview, then the typed note in the same bubble',
        'a removed image with a typed note: "Image not shown" above the note',
      ],
      {
        // The Explain turns are the ones §13.1 asks for; at 256 the four exchanges do not fit at once.
        perShot: (p) =>
          p.locator('[data-turn-id="u3"]').evaluate((el) => el.scrollIntoView({ block: 'start' })),
      },
    );
    await images.close();
  });

  test('Sidepanel — errors', async () => {
    test.setTimeout(360_000);
    const AUTH = {
      code: 'AUTH',
      message: 'Anthropic rejected the key.\nHTTP 401: invalid x-api-key',
      backendId: 'anthropic',
    };
    const sp = await panelWith([
      {
        id: SITE,
        turns: [
          user('u1', 'test', T(3)),
          reply('a1', 'u1', T(3), { status: 'error', content: '', error: AUTH, meta: null }),
        ],
      },
    ]);
    await sp.locator('[data-ega-error-details]').click();
    await matrix(sp, 'error-auth-details', 'the API key was rejected; Details open', [
      'red icon + short title only; body in normal text',
      '"Open settings" first (outlined), "Try again" second, Details as a ghost toggle',
      'raw message in mono under a 2px rule, no box',
    ]);
    await sp.close();

    const rate = await panelWith([
      {
        id: SITE,
        turns: [
          user('u1', 'hola', T(1)),
          reply('a1', 'u1', T(1), {
            status: 'error',
            content: '',
            meta: null,
            error: {
              code: 'RATE_LIMIT',
              message: 'HTTP 429',
              backendId: 'anthropic',
              retryUntil: NOW + 12_000,
            },
          }),
        ],
      },
    ]);
    await matrix(rate, 'error-rate-limit', 'the backend asked to slow down', [
      '"Try again in N s" is the only button, marked unavailable',
    ]);
    await rate.close();

    const partial = await panelWith([
      {
        id: SITE,
        turns: [
          user('u1', 'una historia larga', T(2)),
          reply('a1', 'u1', T(2), {
            status: 'error',
            content: 'Once upon a time there was a long story that stopped',
            meta: null,
            error: { code: 'PROTOCOL', message: 'stream closed', backendId: 'anthropic' },
          }),
        ],
      },
    ]);
    await matrix(partial, 'error-partial', 'the answer stopped early', [
      'partial text first, meta "Partial answer", then the error block with Copy',
    ]);
    await partial.close();

    const stopped = await panelWith([
      {
        id: SITE,
        turns: [
          user('u1', 'hola', T(2)),
          reply('a1', 'u1', T(2), {
            status: 'error',
            content: '',
            meta: null,
            error: { code: 'ABORTED', message: 'cancelled' },
          }),
        ],
      },
    ]);
    await matrix(stopped, 'stopped', 'a reply the user stopped', [
      '"Stopped" muted, no red, a ghost "Try again"',
    ]);
    await stopped.close();

    const empty = await panelWith([
      {
        id: SITE,
        turns: [user('u1', 'hola', T(2)), reply('a1', 'u1', T(2), { content: '' })],
      },
    ]);
    await matrix(empty, 'empty-answer', 'the model sent back nothing', [
      '"No answer came back. Try Regenerate." muted, with the normal action row',
    ]);
    await empty.close();
  });

  test('Sidepanel — reply menus and About', async () => {
    test.setTimeout(360_000);
    // A 9,000-character prompt, kept cut at 6,000, so About shows the cut note.
    const longPrompt = `You are a translator. ${'Keep slang and tone as they are. '.repeat(400)}`;
    const sp = await panelWith([
      {
        id: SITE,
        turns: [
          FIRST_PAIR[0] as Record<string, unknown>,
          reply('a1', 'u1', T(28), {
            meta: realMeta({ instructions: longPrompt.slice(0, 6000), instructionsLength: 9000 }),
          }),
        ],
      },
    ]);
    // The composer targets French, so the menu offers "Translate into French" too.
    await sp.locator('[data-ega-mode-chip]').click();
    await sp.locator('#sp-conv-target').selectOption('fr');
    await sp.keyboard.press('Escape');
    await matrix(
      sp,
      'refine-menu',
      'Refine open on the newest reply, composer target French',
      [
        'presets for the task, "Describe a change…", "Translate into French", "Translate into another language…"',
      ],
      { perShot: (p) => openReplyMenu(p, 'refine') },
    );
    await sp.keyboard.press('Escape');
    await matrix(
      sp,
      'more-menu',
      'More open on the newest reply',
      ['Read aloud, About this reply, "Answer again as" group, Bookmark, Delete last in red'],
      { perShot: (p) => openReplyMenu(p, 'more') },
    );
    await sp.keyboard.press('Escape');
    await matrix(
      sp,
      'more-menu-keyboard',
      'More opened with the keyboard on the newest reply',
      ['the first item has a 2px accent ring inside the menu; More reads as pressed'],
      {
        widths: [WIDTHS[0]],
        perShot: async (p) => {
          if ((await p.locator('[role="menu"]').count()) > 0) return;
          await p.locator('[data-ega-reply]').last().locator('[data-ega-action="more"]').focus();
          await p.keyboard.press('Enter');
          await p.locator('[role="menu"]').waitFor({ state: 'visible' });
        },
      },
    );
    await sp.keyboard.press('Escape');
    await openReplyMenu(sp, 'refine');
    await sp.locator('[data-ega-translate-into-other]').click();
    await sp.locator('[data-ega-translate-into-run]').waitFor({ state: 'visible' });
    await matrix(sp, 'translate-into', 'Translate into another language popover', [
      'title, one language select and one Translate button',
    ]);
    await sp.keyboard.press('Escape');
    await openReplyMenu(sp, 'refine');
    await sp.locator('[data-ega-describe-change]').click();
    await sp.locator('#sp-text').fill('make it sound friendlier');
    await matrix(
      sp,
      'refine-mode',
      'Describe a change chosen, a change typed',
      ['"Changing this reply" chip with a Cancel in place of the mode chip'],
      { keepFocus: true },
    );
    await sp.keyboard.press('Escape');
    await openReplyMenu(sp, 'more');
    await sp.locator('[data-ega-about]').click();
    await sp.locator('[data-ega-inspector]').waitFor({ state: 'visible' });
    await sp.locator('[data-ega-instructions] button').click();
    await matrix(
      sp,
      'about-instructions',
      'About open, Instructions sent open, a 9,000-character prompt',
      [
        'no box: rows of label and value, one quote rule per quoted text',
        'model as a readable name, usage as "42 tokens read · 9 written"',
        'the instructions scroll in their own box, with "Cut at 6,000 of 9,000 characters."',
      ],
      {
        // The thread is scrolled up here, so Jump to latest floats at the bottom: keep the cut note clear of it.
        perShot: (p) =>
          p.locator('.rd-instr-note').evaluate((el) => el.scrollIntoView({ block: 'center' })),
      },
    );
    await matrix(
      sp,
      'about-end',
      'About open, scrolled to its end',
      [
        'the cut note, then "Copy as JSON" as a ghost text button at the end of About',
        'at the newest message, so no Jump to latest pill',
      ],
      {
        perShot: async (p) => {
          await p.locator('.ega-conv-stream').evaluate((el) => (el.scrollTop = el.scrollHeight));
          await p.locator('[data-ega-jump-latest]').waitFor({ state: 'detached' });
        },
      },
    );
    await sp.close();
  });

  test('Sidepanel — header, conversations, search and bookmarks', async () => {
    test.setTimeout(360_000);
    const sp = await panelWith([
      { id: SITE, turns: FIRST_PAIR, updatedAt: T(2) },
      {
        id: `${SITE}#older1`,
        turns: [
          user('x1', 'Hola, me llamo Ana y quiero aprender', T(60 * 26)),
          reply('x2', 'x1', T(60 * 26)),
        ],
        updatedAt: T(60 * 26),
      },
      {
        id: `${SITE}#older2`,
        turns: [user('y1', 'que tal', T(60 * 50)), reply('y2', 'y1', T(60 * 50))],
        updatedAt: T(60 * 50),
      },
      {
        id: 'https://lemonde.fr',
        turns: [user('z1', 'Bonjour à tous', T(60 * 72)), reply('z2', 'z1', T(60 * 72))],
        updatedAt: T(60 * 72),
      },
      {
        id: 'https://news.ycombinator.com',
        turns: [user('w1', 'gracias', T(60 * 100)), reply('w2', 'w1', T(60 * 100))],
        updatedAt: T(60 * 100),
      },
    ]);
    await sp.locator('[data-ega-header-site]').click();
    await sp
      .locator('[data-ega-conversations] [data-ega-conv-row]')
      .first()
      .waitFor({ state: 'visible' });
    await sp.locator('[data-ega-conv-row]').nth(1).locator('[data-ega-conv-delete]').click();
    await sp.locator('[data-ega-conv-undo]').waitFor({ state: 'visible' });
    await matrix(sp, 'conversations', 'the Conversations list, one row just deleted', [
      'This site group first, then Other sites; the open one has a check',
      'the deleted row reads "Conversation deleted" with Undo',
    ]);
    await sp.locator('[data-ega-conv-undo]').click();
    await sp.keyboard.press('Escape');
    await sp.locator('[data-ega-backend-chip]').click();
    await sp.getByRole('dialog', { name: 'Backends' }).waitFor({ state: 'visible' });
    await matrix(sp, 'backend-popover', 'the backend popover', [
      'rows numbered with a plain status each; no scrim',
    ]);
    await sp.keyboard.press('Escape');
    await matrix(
      sp,
      'header-more',
      'header More open',
      ['bookmark filter, export, Keyboard shortcuts, Settings'],
      {
        perShot: async (p) => {
          if ((await p.locator('[data-ega-bookmark-filter]').count()) > 0) return;
          await p.locator('[data-ega-header-more]').click();
          await p.locator('[data-ega-bookmark-filter]').waitFor({ state: 'visible' });
        },
      },
    );
    await sp.keyboard.press('Escape');
    await sp.locator('[data-ega-search-toggle]').click();
    await sp.locator('[data-ega-search]').fill('Hello');
    await matrix(
      sp,
      'search-matches',
      'a search with matches',
      ['search bar under the header with "1 match"'],
      { keepFocus: true },
    );
    await sp.locator('[data-ega-search]').fill('zzz');
    await matrix(
      sp,
      'search-none',
      'a search with no matches',
      ['"No matches" empty state with Clear search'],
      { keepFocus: true },
    );
    await sp.close();

    const marks = await panelWith([
      {
        id: SITE,
        turns: [
          ...FIRST_PAIR,
          user('u2', 'adios', T(20)),
          reply('a2', 'u2', T(20), { content: 'Goodbye.', bookmarked: true }),
        ],
      },
    ]);
    await marks.locator('[data-ega-header-more]').click();
    await marks.locator('[data-ega-bookmark-filter]').click();
    await matrix(marks, 'bookmarks', 'bookmark filter on, one bookmarked pair', [
      'bar "1 bookmarked · Show all"',
    ]);
    await marks.close();
    const none = await panelWith([{ id: SITE, turns: FIRST_PAIR }]);
    await none.locator('[data-ega-header-more]').click();
    await none.locator('[data-ega-bookmark-filter]').click();
    await matrix(none, 'bookmarks-none', 'bookmark filter on, nothing bookmarked', [
      '"No bookmarked messages" empty state',
    ]);
    await none.close();
  });

  test('Sidepanel — composer', async () => {
    test.setTimeout(360_000);
    const sp = await panelWith([{ id: SITE, turns: FIRST_PAIR }]);
    const openMode = async (p: Page): Promise<void> => {
      if ((await p.locator('[data-ega-mode-popover]').count()) > 0) return;
      await p.locator('[data-ega-mode-chip]').click();
      await p.locator('[data-ega-mode-popover]').waitFor({ state: 'visible' });
    };
    await openMode(sp);
    await sp.locator('[data-ega-task="reword"]').click();
    await sp.locator('#sp-conv-source').selectOption('es');
    await matrix(
      sp,
      'mode-popover',
      'Next message popover, Reword, source Spanish',
      ['Task chips with a check on the picked one; From/To stacked with swap; Tone row'],
      { perShot: openMode },
    );
    await sp.locator('[data-ega-task="translate"]').click();
    await sp.locator('#sp-conv-source').selectOption('auto');
    await sp.keyboard.press('Escape');
    await sp.locator('#sp-text').fill('a'.repeat(2012));
    await matrix(
      sp,
      'composer-over-cap',
      'a message over the length cap',
      ['count line "2,012 / 2,000 · 12 too many" in red; Send not ready'],
      { keepFocus: true },
    );
    await sp.locator('#sp-text').fill('');
    await sp.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await sp.keyboard.press('e');
    await sp.locator('[data-ega-mode-banner]').waitFor({ state: 'visible' });
    await matrix(
      sp,
      'edit-mode',
      'editing the newest message',
      ['"Editing your message" chip with Cancel; the edited bubble has an accent outline'],
      { keepFocus: true },
    );
    await sp.keyboard.press('Escape');
    await sp.close();

    await seedSettings(ext.context, ext.extensionId, { contextEnabled: false });
    const off = await panelWith([{ id: SITE, turns: FIRST_PAIR }]);
    await matrix(
      off,
      'mode-popover-page-off',
      'page info off in Settings',
      ['"Page info is off." with "Turn on in Settings"'],
      { perShot: openMode },
    );
    await off.close();
    await seedSettings(ext.context, ext.extensionId, { contextEnabled: true });

    await seedCustomTasks(ext.context, ext.extensionId, [
      customTask({ id: 'c1', label: 'Tweet summary' }),
      customTask({ id: 'c2', label: 'Make it sound like a pirate captain, arr' }),
      customTask({ id: 'c3', label: 'Legal' }),
      customTask({ id: 'c4', label: 'Haiku' }),
      customTask({ id: 'c5', label: 'Release notes' }),
      customTask({ id: 'c6', label: 'Bug report' }),
    ]);
    const many = await panelWith([{ id: SITE, turns: FIRST_PAIR }]);
    await matrix(
      many,
      'mode-popover-many-tasks',
      'six custom tasks, one with the longest allowed name (40 characters)',
      ['task chips wrap to new rows; the 40-character name wraps inside its chip; nothing cut'],
      { perShot: openMode },
    );
    await many.close();
    await seedCustomTasks(ext.context, ext.extensionId, []);

    const img = await panelWith([{ id: SITE, turns: FIRST_PAIR }]);
    // Summarize first: with an image attached it is marked unavailable and cannot be picked.
    await openMode(img);
    await img.locator('[data-ega-task="summarize"]').click();
    await img.keyboard.press('Escape');
    await img
      .locator('[data-ega-image-input]')
      .setInputFiles(path.join(__dirname, 'fixtures', 'arabizi.png'));
    await img.locator('[data-ega-chip-remove]').waitFor({ state: 'visible' });
    await matrix(
      img,
      'mode-popover-image',
      'an image attached, task Summarize',
      [
        'chip "Translate image → English"; tasks that cannot read images marked, with one line saying why',
      ],
      { perShot: openMode },
    );
    await img.close();
  });

  test('Sidepanel — live states', async () => {
    test.setTimeout(360_000);
    // Streaming: the request hangs, so the reply stays pending until the worker hands it text.
    await resetRoutes(ext.context);
    await openExampleTab(ext.context);
    await ext.context.route('https://api.anthropic.com/v1/messages', () => undefined);
    const sp = await panelWith([{ id: SITE, turns: FIRST_PAIR }]);
    await sp.locator('#sp-text').fill('cuéntame una historia larga');
    await sp.keyboard.press('Enter');
    await sp.locator('.ega-skeleton').waitFor({ state: 'visible' });
    await matrix(sp, 'streaming-skeleton', 'a reply on its way, no text yet', [
      'three static text-shaped bars, "Translating…" in the meta slot, Stop in Send’s place',
    ]);
    const requestId = await sp.evaluate(
      () => (globalThis as { __egaLastRequestId?: string }).__egaLastRequestId,
    );
    const lines = Array.from(
      { length: 40 },
      (_, i) => `Line ${i + 1} of a long story that keeps going.`,
    ).join('\\n');
    const [sw] = ext.context.serviceWorkers();
    await sw?.evaluate(
      async ({ id, text }) => {
        await chrome.runtime.sendMessage({
          kind: 'translate:chunk',
          chunk: { type: 'delta', requestId: id, text },
        });
      },
      { id: requestId ?? '', text: `{"translation":"${lines}` },
    );
    await sp.locator('.ega-cursor').waitFor({ state: 'visible' });
    await matrix(sp, 'streaming-text', 'a long answer mid-stream', [
      'text streams with a caret; the view keeps the start of the reply in sight',
    ]);
    await sp.keyboard.press('Escape');
    await sp.close();
    await resetRoutes(ext.context);
    await openExampleTab(ext.context);

    // Delete then the Undo toast, bottom-centre above the composer.
    const del = await panelWith([
      {
        id: SITE,
        turns: [
          ...FIRST_PAIR,
          user('u2', 'adios', T(20)),
          reply('a2', 'u2', T(20), { content: 'Goodbye.' }),
        ],
      },
    ]);
    await openReplyMenu(del, 'more');
    await del.locator('[data-ega-delete]').click();
    await del.locator('[data-sonner-toast]').first().waitFor({ state: 'visible' });
    await matrix(del, 'toast-undo', 'right after Delete', [
      'toast bottom-centre, just above the composer, with Undo',
    ]);
    await del.close();

    // Keyboard rings on older items.
    const rows = await panelWith([
      {
        id: SITE,
        turns: [
          ...FIRST_PAIR,
          user('u2', 'adios', T(20)),
          reply('a2', 'u2', T(20), { content: 'Goodbye.' }),
        ],
      },
    ]);
    await matrix(
      rows,
      'focus-rows',
      'Tab into an older message toolbar',
      ['the toolbar shows while focus is inside it, with a 2px ring'],
      {
        perShot: async (p) => {
          await p.locator('[data-ega-user-turn]').first().focus();
          await p.keyboard.press('Tab');
        },
      },
    );
    await matrix(
      rows,
      'focus-reply-row',
      'Tab into an older reply row',
      ['the row shows while focus is inside it'],
      {
        perShot: async (p) => {
          await p.locator('[data-ega-reply]').first().focus();
          await p.keyboard.press('Tab');
        },
      },
    );
    await matrix(
      rows,
      'focus-j-ring',
      'j pressed from the first message',
      ['the 2px ring moves to the first reply, with keyboard focus; nothing else moves'],
      {
        perShot: async (p) => {
          // k clamps at the first message, so every shot starts the same; j then rings the first reply.
          await p.locator('[data-ega-reply]').first().focus();
          for (let i = 0; i < 4; i++) await p.keyboard.press('k');
          await p.keyboard.press('j');
        },
      },
    );
    await rows.close();

    // Palette and shortcut sheet.
    const pal = await panelWith([{ id: SITE, turns: FIRST_PAIR }]);
    await pal.keyboard.press('Control+K');
    await pal.locator('[role="dialog"]:visible').first().waitFor({ state: 'visible' });
    await matrix(pal, 'palette', 'Ctrl+K open', ['the command palette fits the panel']);
    await pal.keyboard.press('Escape');
    await pal.locator('[data-ega-header-site]').focus();
    await pal.keyboard.press('?');
    // The dialog node is a box-less wrapper; its heading is what shows.
    await pal.getByRole('heading', { name: 'Keyboard shortcuts' }).waitFor({ state: 'visible' });
    await matrix(pal, 'shortcuts', '? open', ['the shortcut sheet fits the panel']);
    await pal.keyboard.press('Escape');
    await pal.close();

    // Drag over the composer.
    const drag = await panelWith([{ id: SITE, turns: FIRST_PAIR }]);
    await drag.evaluate(() => {
      document.querySelector('#sp-text')?.dispatchEvent(
        new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: new DataTransfer(),
        }),
      );
    });
    await matrix(drag, 'composer-drag', 'a file dragged over the composer', [
      'dashed accent outline and a soft fill on the box; nothing moved',
    ]);
    await drag.close();

    // A save that fails on a full disk.
    const full = await panelWith([{ id: SITE, turns: FIRST_PAIR }]);
    await full.evaluate(() => {
      const real = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = ((items: Record<string, unknown>) =>
        Object.keys(items).some((k) => k.startsWith('ega:conv:'))
          ? Promise.reject(new Error('QUOTA_BYTES quota exceeded'))
          : real(items)) as typeof chrome.storage.local.set;
    });
    await openReplyMenu(full, 'more');
    await full.locator('[data-ega-bookmark]').click();
    await full.locator('[data-ega-save-failed]').waitFor({ state: 'visible' });
    await matrix(full, 'save-failed', 'storage full', [
      'one banner above the composer with Try again',
    ]);
    await full.close();

    // Dictation and reading aloud, with the browser APIs stubbed.
    const voice = await ext.context.newPage();
    await voice.addInitScript(() => {
      class FakeRecognition {
        lang = '';
        interimResults = false;
        continuous = false;
        onresult = null;
        onend: (() => void) | null = null;
        onerror = null;
        start(): void {}
        stop(): void {
          queueMicrotask(() => this.onend?.());
        }
      }
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
      speechSynthesis.getVoices = () =>
        [
          { lang: 'en-US', localService: true, default: true, name: 'Test', voiceURI: 'test' },
        ] as unknown as SpeechSynthesisVoice[];
      speechSynthesis.speak = () => undefined;
    });
    await voice.clock.setFixedTime(NOW);
    await voice.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
    await seedConversations(voice, [{ id: SITE, turns: FIRST_PAIR }]);
    await reloadPanel(voice);
    await voice.locator('[data-ega-add]').click();
    await voice.locator('[data-ega-mic]').click();
    await voice.locator('[aria-label="Stop dictation"]').waitFor({ state: 'visible' });
    await matrix(voice, 'dictating', 'dictation on', [
      'Add became a red "Stop dictation" in the same place',
    ]);
    await voice.locator('[aria-label="Stop dictation"]').click();
    await voice.locator('[data-ega-add][aria-label="Add"]').waitFor({ state: 'visible' });
    await openReplyMenu(voice, 'more');
    await voice.locator('[data-ega-speak]').click();
    await voice.locator('[data-ega-meta-stop]').waitFor({ state: 'visible' });
    await matrix(
      voice,
      'reading-aloud',
      'Read aloud playing, Stop reached with the keyboard',
      [
        'meta line "Reading aloud · Stop"; the composer shows Add again, not a dictation control',
        'the focused Stop draws its whole 2px ring inside the meta line',
      ],
      {
        perShot: async (p) => {
          await p.locator('[data-ega-meta-stop]').focus();
          await p.keyboard.press('Shift+Tab');
          await p.keyboard.press('Tab');
        },
      },
    );
    await voice.close();

    // Forced colours (400 only) and a wide window (light only).
    const fc = await panelWith([{ id: SITE, turns: FIRST_PAIR }]);
    for (const theme of ['light', 'dark'] as const) {
      await fc.emulateMedia({ forcedColors: 'active', colorScheme: theme });
      await matrix(
        fc,
        'forced-colors',
        `first exchange with forced colours, the ${theme} system palette`,
        ['bubble, chip, box and buttons keep a visible edge'],
        { widths: [WIDTHS[0]], themes: [theme] },
      );
    }
    const palette = (theme: string): Buffer =>
      fs.readFileSync(path.join(CURRENT_DIR, `sidepanel-forced-colors-400-${theme}.png`));
    expect(palette('light').equals(palette('dark')), 'two different system palettes').toBe(false);
    await fc.emulateMedia({ forcedColors: 'none', colorScheme: null });
    await matrix(
      fc,
      'wide',
      'first exchange in a 1200px window',
      ['thread and composer in one 720px column'],
      {
        widths: [
          {
            tag: '1200',
            viewport: { width: 1200, height: 800 },
            at: '1200px',
          } as unknown as (typeof WIDTHS)[number],
        ],
        themes: ['light'],
      },
    );
    await fc.close();
  });
});

// ── Options (spec 9.2) ───────────────────────────────────────────────────
// Each state is shot in light and dark. The theme is a setting (H-a), so the header toggle matches the page.

type OptTheme = 'light' | 'dark';
const OPT_THEMES: readonly OptTheme[] = ['light', 'dark'];
const OPTIONS_CONFIGURED = { anthropicApiKey: 'sk-ant-audit', onboardingDismissed: true };

interface OpenOpts {
  /** Merged over the configured base, or over nothing when `fresh`. */
  seed?: Record<string, unknown>;
  fresh?: boolean;
  /** Other storage keys (custom tasks, the request list, conversations). */
  storage?: Record<string, unknown>;
  width?: number;
  height?: number;
  tab?: string;
  sub?: 'data' | 'diagnostics';
  /** Runs before any page script (a slow storage read, a fake native host). */
  init?: string;
}

/** A fresh options page with only this state's storage: a capture never inherits a sibling's seed. */
async function openOptionsState(theme: OptTheme, o: OpenOpts = {}): Promise<Page> {
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: o.width ?? 1200, height: o.height ?? 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.evaluate(
    async ({ settings, storage }) => {
      await chrome.storage.session.remove('ega.audit-log.filters');
      const all = await chrome.storage.local.get(null);
      const stale = Object.keys(all).filter((k) => k.startsWith('ega:conv:'));
      if (stale.length > 0) await chrome.storage.local.remove(stale);
      await chrome.storage.local.set({
        'ega.settings': settings,
        'ega.customTasks': [],
        'ega.customLanguages': [],
        egaAuditLog: { version: 1, entries: [] },
        ...storage,
      });
    },
    {
      settings: { ...(o.fresh ? {} : OPTIONS_CONFIGURED), ...o.seed, theme },
      storage: o.storage ?? {},
    },
  );
  if (o.init) await page.addInitScript(o.init);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.locator('#tab-translate').waitFor();
  if (o.tab) {
    await page.locator(`#tab-${o.tab}`).click();
    await page.locator(`#tabpanel-${o.tab}`).waitFor();
  }
  if (o.sub) {
    await page.locator(`[data-ega-subtab="${o.sub}"]`).click();
    await page.locator(`#adv-pane-${o.sub}`).waitFor();
  }
  await page.mouse.move(0, 790);
  return page;
}

interface OptShot {
  userAction: string;
  expectations: string[];
  /** A dialog, popover or (i) is meant to be open: the shot is the viewport (H-b), and it must be open. */
  overlay?: boolean | 'maybe';
  viewportOnly?: boolean;
  /** The whole tab, top to bottom (a tab's own capture); a state is the viewport around its subject. */
  fullPage?: boolean;
  skipPark?: boolean;
}

/** Scrolls the state's subject to the middle of the viewport. */
async function centerOn(page: Page, selector: string): Promise<void> {
  await page
    .locator(selector)
    .first()
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
}

async function optShot(page: Page, name: string, theme: OptTheme, s: OptShot): Promise<void> {
  const viewport = page.viewportSize();
  await shot(
    page,
    theme === 'dark' ? `${name}-dark` : name,
    {
      surface: 'options',
      state: name,
      theme,
      userAction: s.userAction,
      expectations: s.expectations,
      ...(viewport ? { viewport } : {}),
    },
    {
      overlay: s.overlay ?? false,
      viewportOnly: s.fullPage !== true,
      ...(s.skipPark ? { skipPark: true } : {}),
    },
  );
}

const TAB_IDS = SETTINGS_TABS.map((t) => t.id);

const SAMPLE_AUDIT = (now: number): unknown[] => {
  const base = {
    sourceLang: 'es',
    targetLang: 'en',
    model: 'claude-haiku-4-5',
    systemPrompt: 'You are a translator.',
    userPrompt: 'Translate: hola, ¿cómo estás?',
    response: 'Hello, how are you?',
    cacheHit: false,
  };
  return [
    {
      ...base,
      id: 'au-1',
      ts: now - 2 * 60_000,
      task: 'translate',
      backend: 'anthropic',
      latencyMs: 410,
      inputTokens: 1200,
      outputTokens: 30,
    },
    {
      ...base,
      id: 'au-2',
      ts: now - 5 * 60_000,
      task: 'explain',
      backend: 'gemini',
      model: 'gemini-2.5-flash',
      systemPrompt: 'Explain the text in plain words.',
      userPrompt: 'Explain: hola, ¿cómo estás?',
      response: '',
      latencyMs: 2300,
      error: { code: 'AUTH', message: '401 API key not valid. Please pass a valid API key.' },
    },
    {
      ...base,
      id: 'au-3',
      ts: now - 9 * 60_000,
      task: 'translate',
      backend: 'unknown',
      latencyMs: 4,
      cacheHit: true,
    },
    {
      ...base,
      id: 'au-4',
      ts: now - 14 * 60_000,
      task: 'summarize',
      backend: 'anthropic',
      latencyMs: 1650,
      inputTokens: 2400,
      outputTokens: 80,
    },
    {
      ...base,
      id: 'au-5',
      ts: now - 30 * 60_000,
      task: 'translate',
      backend: 'anthropic',
      latencyMs: 30000,
      error: { code: 'TIMEOUT', message: 'No reply after 30 s' },
    },
  ];
};

test('Options frame — every tab configured and with the notice, and loading (light + dark)', async () => {
  test.setTimeout(600_000);
  for (const theme of OPT_THEMES) {
    for (const id of TAB_IDS) {
      const page = await openOptionsState(theme, { tab: id });
      await optShot(page, `options-${id}`, theme, {
        fullPage: true,
        userAction: `user opened the ${id} tab with a backend already set up`,
        expectations: [
          'title (20px) and one description line (13px); no notice above the title',
          'cards: title 14px, at most one description line, body 13px; no text cut off',
          'left rail visible with the tab selected',
        ],
      });
      await page.close();
      const fresh = await openOptionsState(theme, { fresh: true, tab: id });
      // Backends shows Get started instead of the notice.
      await expect(
        fresh.locator('[data-ega-status-bar], [data-ega-get-started]').first(),
      ).toBeVisible();
      await optShot(fresh, `options-${id}-notice`, theme, {
        fullPage: true,
        userAction: `user opened the ${id} tab on a fresh install with no backend set up`,
        expectations: [
          'one notice above the title: "No backend is set up yet, so Ega cannot translate" with one action',
          'a space-5 gap between the notice and the title',
        ],
      });
      await fresh.close();
    }
    // A slow first read: the skeleton shows instead of an empty tab.
    // Every storage read in the first 4 s waits until then.
    const slow = `(() => { const g = chrome.storage.local.get.bind(chrome.storage.local); const t0 = Date.now();
      chrome.storage.local.get = (...a) => { const left = 4000 - (Date.now() - t0);
        return left <= 0 ? g(...a) : new Promise((r) => setTimeout(() => r(g(...a)), left)); }; })();`;
    const page = await ext.context.newPage();
    await page.setViewportSize({ width: 1200, height: 800 });
    // The theme setting is not read yet, so the system theme paints the skeleton; it must match the shot's theme.
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await seedSettings(ext.context, ext.extensionId, { ...OPTIONS_CONFIGURED, theme });
    await page.addInitScript(slow);
    await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    await page.locator('[data-ega-loading-state]').first().waitFor();
    await optShot(page, 'options-loading', theme, {
      userAction: 'user opened Settings while the first settings read was slow',
      expectations: ['skeleton rows in place of the cards, with no empty state and no error'],
      viewportOnly: true,
    });
    await page.close();
  }
});

test('Options frame — every tab at 880px, at 600px and with forced colors (light + dark)', async () => {
  test.setTimeout(600_000);
  for (const theme of OPT_THEMES) {
    for (const width of [880, 600]) {
      for (const id of TAB_IDS) {
        const page = await openOptionsState(theme, { tab: id, width });
        await optShot(page, `options-narrow-${width}-${id}`, theme, {
          fullPage: true,
          userAction: `user narrowed the Settings window to ${width}px on the ${id} tab`,
          expectations: [
            'the rail turns to icons; no text is cut off; labels may wrap',
            'rows keep their controls on one line or stack cleanly; nothing overlaps',
          ],
        });
        await page.close();
      }
    }
    for (const id of TAB_IDS) {
      const page = await openOptionsState(theme, { tab: id });
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      await page.waitForTimeout(150); // wait for the forced-colors repaint (no observable end state)
      await optShot(page, `options-forced-colors-${id}`, theme, {
        fullPage: true,
        userAction: `user opened the ${id} tab with Windows high contrast on`,
        expectations: [
          'every control and card edge stays visible in system colors',
          'the selected tab and checked boxes read as selected without color',
        ],
      });
      await page.close();
    }
  }
});

test('Options frame — the keyboard walk on Answers and Backends (light + dark)', async () => {
  test.setTimeout(600_000);
  for (const theme of OPT_THEMES) {
    for (const id of ['translate', 'backends']) {
      const page = await openOptionsState(theme, { tab: id });
      // A click on the page title moves Chrome's Tab starting point to the top, so the walk starts at the header.
      await page.locator('.options-title').click();
      await page.mouse.move(0, 790);
      for (let n = 0; n < 80; n++) {
        await page.keyboard.press('Tab');
        // Each stop is marked once; meeting a marked one again means the walk went round.
        const fresh = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body || el.dataset['egaWalk'] !== undefined) return false;
          el.dataset['egaWalk'] = '1';
          el.scrollIntoView({ block: 'center' });
          return true;
        });
        if (!fresh) break;
        await optShot(page, `options-focus-walk-${id}-${String(n + 1).padStart(2, '0')}`, theme, {
          userAction: `user pressed Tab ${n + 1} times on the ${id} tab`,
          expectations: [
            'exactly one control shows a clear focus ring',
            'the focused control is fully visible',
          ],
          viewportOnly: true,
          skipPark: true,
          // Focus opens an (i), so a tip may show.
          overlay: 'maybe',
        });
      }
      await page.close();
    }
  }
});

test('Options frame — search, palette and shortcut sheet (light + dark)', async () => {
  test.setTimeout(600_000);
  for (const theme of OPT_THEMES) {
    const page = await openOptionsState(theme, {
      seed: { confidencePill: false, streaming: false },
    });
    const search = page.getByRole('dialog', { name: 'Search settings' });
    await page.keyboard.press('Control+,');
    await expect(search).toBeVisible();
    await optShot(page, 'settings-search-empty', theme, {
      userAction: 'user pressed Ctrl+, to search settings',
      expectations: [
        '"Popular settings" heading and six entries',
        'full-width search field with its icon',
      ],
      overlay: true,
    });
    const field = page.locator('input[aria-label="Search settings"]');
    await field.fill('temperature');
    await optShot(page, 'settings-search-results', theme, {
      userAction: 'user typed "temperature"',
      expectations: [
        'each result: label, its one-line description, and a tab chip',
        'the match is highlighted',
      ],
      overlay: true,
    });
    await field.fill('xyzzy');
    await optShot(page, 'settings-search-no-results', theme, {
      userAction: 'user typed a word no setting has',
      expectations: ['"No setting matches "xyzzy"" and a ghost "Clear search"'],
      overlay: true,
    });
    await field.fill('');
    await search.getByText('Changed only').click();
    await optShot(page, 'settings-search-changed-only', theme, {
      userAction: 'user ticked Changed only with two settings changed',
      expectations: ['only the changed settings are listed'],
      overlay: true,
    });
    await search.getByText('Changed only').click();
    await field.fill('theme');
    await optShot(page, 'settings-search-theme-header', theme, {
      userAction: 'user searched for the theme setting',
      expectations: ['the Theme result carries the chip "Header", not a tab name'],
      overlay: true,
    });
    await page.keyboard.press('Escape');
    await expect(search).toBeHidden();

    await page.keyboard.press('Control+k');
    await expect(page.getByPlaceholder('Type a command or search…')).toBeVisible();
    await optShot(page, 'command-palette', theme, {
      userAction: 'user pressed Ctrl+K',
      expectations: [
        'the command list with group headings in sentence case',
        'the search field is focused',
      ],
      overlay: true,
    });
    await page.keyboard.press('Escape');
    await page.locator('body').press('?');
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await optShot(page, 'shortcut-sheet', theme, {
      userAction: 'user pressed ? for the shortcut sheet',
      expectations: ['every shortcut with its keys; nothing cut off'],
      overlay: true,
    });
    await page.keyboard.press('Escape');
    await page.close();
  }
});

test('Options frame — toasts, the save failure and the (i) tips (light + dark)', async () => {
  test.setTimeout(600_000);
  const sites = {
    'news.example.com': { disabled: true },
    'shop.example.com': { disabled: false, defaultLang: 'es' },
    'docs.example.com': { disabled: true },
  };
  for (const theme of OPT_THEMES) {
    let page = await openOptionsState(theme, {
      seed: { sitePrefs: sites },
      tab: 'advanced',
      sub: 'data',
    });
    await page.getByRole('button', { name: /^Remove (https?:\/\/)?news\.example\.com$/ }).click();
    await page.locator('[data-sonner-toast]').first().waitFor();
    await optShot(page, 'toast-success-undo', theme, {
      userAction: 'user removed a site override',
      expectations: [
        'toast bottom-right: "Removed news.example.com" with an Undo text button and a close button inside',
      ],
      viewportOnly: true,
    });
    await page.getByRole('button', { name: /^Remove (https?:\/\/)?shop\.example\.com$/ }).click();
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(2);
    await optShot(page, 'toast-stacked', theme, {
      userAction: 'user removed a second site override while the first toast still showed',
      expectations: ['two toasts stacked without overlap; the newest on top'],
      viewportOnly: true,
    });
    await page.close();

    const failing = `(() => { const s = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = (m, ...r) => m && m.kind === 'cache:clear' ? Promise.reject(new Error('worker gone')) : s(m, ...r); })();`;
    page = await openOptionsState(theme, { tab: 'advanced', sub: 'data', init: failing });
    await page.locator('[data-ega-clear-cache]').click();
    await page.locator('[data-sonner-toast]').first().waitFor();
    await optShot(page, 'toast-error', theme, {
      userAction: 'user pressed Clear cache while the background worker could not answer',
      expectations: [
        'an error toast that says what happened, with Try again; it stays until dismissed',
      ],
      viewportOnly: true,
    });
    await page.close();

    page = await openOptionsState(theme, { tab: 'translate' });
    await page.evaluate(() => {
      chrome.storage.local.set = (() =>
        Promise.reject(new Error('QUOTA_BYTES quota exceeded'))) as typeof chrome.storage.local.set;
    });
    await page.getByRole('checkbox', { name: /Show confidence pill/ }).click();
    await page.locator('[data-sonner-toast]').first().waitFor();
    await optShot(page, 'toast-save-failure', theme, {
      userAction: 'user changed a setting while Chrome refused to store it',
      expectations: ['"Not saved. Chrome did not take the change." with Try again'],
      viewportOnly: true,
    });
    await page.close();

    page = await openOptionsState(theme, { tab: 'translate' });
    const tip = page.locator('[data-ega-infotip]').first();
    await tip.hover();
    await expect(page.locator('[data-ega-infotip-text]')).toBeVisible();
    await optShot(page, 'infotip-hover', theme, {
      userAction: 'user rested the pointer on the first (i) of the Answers tab',
      expectations: ['the tip opens under the (i), short plain sentences, no links'],
      overlay: true,
      viewportOnly: true,
      skipPark: true,
    });
    await page.mouse.move(0, 790);
    await expect(page.locator('[data-ega-infotip-text]')).toHaveCount(0);
    await tip.focus();
    await expect(page.locator('[data-ega-infotip-text]')).toBeVisible();
    await optShot(page, 'infotip-focus', theme, {
      userAction: 'user tabbed to the (i)',
      expectations: ['focus ring on the (i) and the tip open under it'],
      overlay: true,
      viewportOnly: true,
    });
    await page.keyboard.press('Escape');
    await tip.click();
    await expect(page.locator('[data-ega-infotip-text]')).toBeVisible();
    await page.mouse.move(0, 790);
    await optShot(page, 'infotip-pinned', theme, {
      userAction: 'user clicked the (i) and moved the pointer away',
      expectations: ['the tip stays open until Esc or a click outside'],
      overlay: true,
      viewportOnly: true,
    });
    await page.keyboard.press('Escape');
    await page.close();
  }
});

test('Options Answers — where answers show, page context, generation, page translate (light + dark)', async () => {
  test.setTimeout(600_000);
  for (const theme of OPT_THEMES) {
    let page = await openOptionsState(theme, { tab: 'translate' });
    await expect(page.locator('[data-ega-knob-group="shared"]')).toBeVisible();
    await page.locator('[data-ega-mode="inline"]').click();
    await expect(page.locator('[data-ega-mode="inline"]')).toHaveAttribute('aria-checked', 'true');
    await optShot(page, 'answers-where-answers-show-inline', theme, {
      userAction: 'user picked Inline under Where answers show',
      expectations: ['Inline is selected and its picture shows the answer in place of the text'],
    });
    await page.getByRole('checkbox', { name: /Show confidence pill/ }).click();
    await expect(page.locator('[data-ega-section-reset]').first()).toBeVisible();
    await centerOn(page, '[data-ega-section-reset]');
    await optShot(page, 'answers-where-answers-show-changed', theme, {
      userAction: 'user changed two settings in the card',
      expectations: ['the card header shows the Reset section pill'],
    });
    await page.locator('[data-ega-section-reset]').first().click();
    await page.locator('[data-sonner-toast]').first().waitFor();
    await optShot(page, 'answers-where-answers-show-after-reset', theme, {
      userAction: 'user pressed Reset section',
      expectations: [
        'the pill and tooltip options are back to defaults and the Inline pick stays; a toast with Undo',
      ],
    });
    await page.close();

    page = await openOptionsState(theme, { tab: 'translate' });
    await expect(page.locator('[data-ega-task-usage]').first()).toBeVisible();
    await page.locator('[data-ega-context-level="rich"]').click();
    await centerOn(page, '[data-ega-context-level="rich"]');
    await optShot(page, 'answers-page-context-rich', theme, {
      userAction: 'user picked the richer page context',
      expectations: ['How much: Rich is selected, with its one line about what it sends'],
    });
    await page.locator('[data-ega-setting="advanced.pageContextPayload"] summary').click();
    await optShot(page, 'answers-page-context-fine-tune-open', theme, {
      userAction: 'user opened Fine-tune what is sent',
      expectations: ['the four sliders show, each label left and value right, with its hint'],
    });
    await page.close();

    page = await openOptionsState(theme, { tab: 'translate', seed: { contextEnabled: false } });
    await centerOn(page, '[data-ega-setting="display.contextEnabled"]');
    await optShot(page, 'answers-page-context-context-off', theme, {
      userAction: 'user turned page context off',
      expectations: ['"Sent with" reads None; the level choice is hidden'],
    });
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'translate',
      seed: {
        groqApiKey: 'gsk-audit',
        backendOrder: ['groq', 'anthropic', 'gemini', 'native'],
        disabledBackends: [],
        advanced: { effort: 'medium' },
      },
    });
    await page.locator('[data-ega-generation-card]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-ega-generation-note]').first()).toBeVisible();
    await expect(page.locator('[data-ega-default-tick]').first()).toBeAttached();
    await optShot(page, 'answers-generation-model-no-effort', theme, {
      userAction: 'user set Effort to Medium with a model that has no effort setting first in line',
      expectations: ['a muted note under Effort: "Groq ignores Effort"; the control stays enabled'],
    });
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'translate',
      seed: {
        openaiApiKey: 'sk-audit',
        backendOrder: ['openai', 'anthropic', 'gemini', 'native'],
        disabledBackends: [],
        model: { openai: 'o4-mini' },
        advanced: { effort: 'off' },
      },
    });
    await page.locator('[data-ega-generation-card]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-ega-generation-note]').first()).toBeVisible();
    await optShot(page, 'answers-generation-reasoning-model', theme, {
      userAction: 'user has a reasoning model first in line with Effort Off',
      expectations: [
        '"OpenAI has no Off, so it runs at Low"',
        'a note that OpenAI ignores the creativity setting',
      ],
    });
    await page.close();

    page = await openOptionsState(theme, { tab: 'translate' });
    await page.getByText('Batch settings').click();
    await page.locator('[data-ega-setting="advanced.batchConcurrency"]').scrollIntoViewIfNeeded();
    await optShot(page, 'answers-page-translate-batch-open', theme, {
      userAction: 'user opened Batch settings in Page translate',
      expectations: ['Areas sent at once slider with its value and one-line hint'],
    });
    await page.close();

    // Two tried backends ignore the temperature, so one note joins their names. The native host cannot stand in:
    // the route plan comes from the service worker's own probe, which no page script can fake.
    page = await openOptionsState(theme, {
      tab: 'translate',
      seed: {
        openaiApiKey: 'sk-audit',
        geminiApiKey: 'AIza-audit',
        backendOrder: ['openai', 'gemini', 'anthropic', 'native'],
        disabledBackends: [],
        model: { openai: 'o4-mini' },
      },
    });
    await page.locator('[data-ega-generation-card]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-ega-generation-note="temperature"]')).toContainText(' and ', {
      timeout: 10_000,
    });
    await optShot(page, 'answers-generation-joined-note', theme, {
      userAction: 'user has an OpenAI reasoning model first in line and Gemini next',
      expectations: ['one joined note under Creativity: "OpenAI and Gemini ignore this"'],
    });
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'translate',
      seed: {
        taskOverrides: { translate: { pageContext: false }, explain: { pageContext: false } },
      },
    });
    await centerOn(page, '[data-ega-setting="display.contextEnabled"]');
    await expect(page.locator('[data-ega-task-usage]').first()).toContainText('No task sends it');
    await optShot(page, 'answers-page-context-sent-with-none', theme, {
      userAction: 'user turned page context off in every task that sent it',
      expectations: ['"Sent with" reads "No task sends it" while page context stays on'],
    });
    await page.locator('[data-ega-setting="advanced.pageContextPayload"] summary').click();
    await centerOn(page, '[data-ega-setting="advanced.pageContextPayload"]');
    await optShot(page, 'answers-page-context-minimal-fine-tune', theme, {
      userAction: 'user opened Fine-tune what is sent with How much on Minimal',
      expectations: ['the sliders that only Rich uses say "Used only with Rich"'],
    });
    await page.close();

    page = await openOptionsState(theme, { tab: 'translate', seed: { streaming: false } });
    await centerOn(page, '[data-ega-setting="display.streaming"]');
    await optShot(page, 'answers-streaming-off', theme, {
      userAction: 'user turned streaming off',
      expectations: ['the streaming-only control says "Used only while streaming is on"'],
    });
    await page.close();
  }
});

const TASK_IDS = [
  'translate',
  'explain',
  'summarize',
  'reword',
  'grammar',
  'suggest-replies',
  'ask',
];

async function openTaskDialog(page: Page, id: string): Promise<Locator> {
  await page.locator(`[data-ega-task-edit="${id}"]`).click();
  const dialog = page.locator(`[data-ega-task-dialog="${id}"]`);
  await dialog.waitFor();
  return dialog;
}

async function closeDialogs(page: Page): Promise<void> {
  for (let i = 0; i < 3 && (await page.locator('.ega-dialog').count()) > 0; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150); // wait for the dialog to unmount (no observable end state)
  }
}

test('Options Tasks — your tasks and every task dialog (light + dark)', async () => {
  test.setTimeout(900_000);
  const many = Array.from({ length: 50 }, (_, n) =>
    customTask({ id: `c-cap-${n}`, label: `Task ${n + 1}`, createdAt: n + 1 }),
  );
  for (const theme of OPT_THEMES) {
    let page = await openOptionsState(theme, { tab: 'tasks' });
    await page
      .locator('[data-ega-custom-task-list], [data-ega-empty-state]')
      .first()
      .scrollIntoViewIfNeeded();
    await optShot(page, 'tasks-your-tasks-empty', theme, {
      userAction: 'user opened Tasks with no tasks of their own',
      expectations: [
        'Your tasks shows one EmptyState that carries the New task action; no header button',
      ],
    });
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'tasks',
      storage: {
        'ega.customTasks': [
          customTask(),
          customTask({ id: 'c-formal', label: 'Formal email', createdAt: 2 }),
        ],
      },
    });
    await centerOn(page, '[data-ega-custom-task-list]');
    await optShot(page, 'tasks-your-tasks-populated', theme, {
      userAction: 'user has two tasks of their own',
      expectations: ['two hairline rows with Edit; New task in the card header'],
    });
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'tasks',
      storage: {
        'ega.customTasks': [
          customTask({
            label: 'Rewrite this for a very formal business email to a client in Germany',
          }),
        ],
      },
    });
    await centerOn(page, '[data-ega-custom-task-list]');
    await optShot(page, 'tasks-your-tasks-long-name', theme, {
      userAction: 'user has a task with a long name',
      expectations: ['the long name wraps; nothing is cut off; Edit stays on the row'],
    });
    await page.close();

    page = await openOptionsState(theme, { tab: 'tasks', storage: { 'ega.customTasks': many } });
    await page.locator('[data-ega-custom-task-cap]').scrollIntoViewIfNeeded();
    await optShot(page, 'tasks-your-tasks-at-cap', theme, {
      userAction: 'user has 50 tasks, the most Ega keeps',
      expectations: [
        'New task does nothing and says why in visible text: "You have the most tasks Ega keeps (50)..."',
      ],
    });
    await page.close();

    page = await openOptionsState(theme, { tab: 'tasks' });
    for (const id of TASK_IDS) {
      await openTaskDialog(page, id);
      await expect(page.locator('[data-ega-task-facts]')).toBeVisible();
      await optShot(page, `task-dialog-${id}`, theme, {
        userAction: `user opened the ${id} task`,
        expectations: [
          'settings first (Effort, Inputs), then the prompt or the line naming the prompt it uses',
          'footer fixed at the bottom',
        ],
        overlay: true,
      });
      await page
        .locator('.ega-dialog-body')
        .last()
        .evaluate((b) => b.scrollTo({ top: b.scrollHeight }));
      await page.waitForTimeout(100); // wait for the scroll cue to update (no observable end state)
      await optShot(page, `task-dialog-${id}-end`, theme, {
        userAction: `user scrolled the ${id} task to the end`,
        expectations: ['the last line sits above the footer; no cue at the bottom edge'],
        overlay: true,
      });
      await closeDialogs(page);
    }

    let dialog = await openTaskDialog(page, 'translate');
    await expect(dialog.locator('[data-ega-answer-format]')).toBeVisible();
    await dialog.locator('[data-ega-prompt-tab="preview"]').click();
    await optShot(page, 'task-dialog-translate-preview', theme, {
      userAction: 'user pressed Preview in the Translate prompt',
      expectations: [
        'the full system and message text with sample text filled in; Edit and Preview as tabs',
      ],
      overlay: true,
    });
    await dialog.getByRole('radio', { name: 'Explain' }).click();
    await expect(dialog.locator('[data-ega-preview-system]')).toBeVisible();
    await optShot(page, 'task-dialog-preview-explain', theme, {
      userAction: 'user picked Preview as Explain in the Translate prompt',
      expectations: ['the prompt as Explain sends it, with its own instructions joined in'],
      overlay: true,
    });
    await closeDialogs(page);
    dialog = await openTaskDialog(page, 'summarize');
    await dialog.locator('[data-ega-prompt-tab="preview"]').click();
    await optShot(page, 'task-dialog-preview-summarize', theme, {
      userAction: 'user pressed Preview in the Summarize prompt',
      expectations: ['the built prompt for Summarize, read-only'],
      overlay: true,
    });
    await dialog.locator('[data-ega-prompt-tab="edit"]').click();
    await dialog.locator('[data-ega-slot-insert-picker]').click();
    await page.locator('[data-ega-variable-picker]').waitFor();
    await optShot(page, 'task-dialog-insert-variable-open', theme, {
      userAction: 'user opened Insert variable',
      expectations: [
        'search field on top; each variable with its name, token and meaning; nothing cut off',
      ],
      overlay: true,
      skipPark: true,
    });
    await page.locator('.vp-search').fill('explain', { timeout: 5_000 });
    await expect(page.locator('[data-ega-variable-picker]')).toContainText('Empty in this prompt');
    await optShot(page, 'task-dialog-insert-variable-empty-group', theme, {
      userAction: 'user searched the variables for one Summarize leaves empty',
      expectations: [
        '"Empty in this prompt" with the row dimmed and its reason as the second line',
      ],
      overlay: true,
      skipPark: true,
    });
    await page.keyboard.press('Escape');
    await closeDialogs(page);

    // Reset task: the footer says "Back to built-in" with Undo.
    await page.close();
    page = await openOptionsState(theme, {
      tab: 'tasks',
      seed: { taskOverrides: { summarize: { effort: 'high' } } },
    });
    await openTaskDialog(page, 'summarize');
    // Reset task sits in the dialog footer, outside the task body.
    await page.locator('.ega-dialog [data-ega-section-reset]').click();
    await expect(page.locator('[data-ega-dialog-status]')).toContainText(/built-in/i);
    await optShot(page, 'task-dialog-reset-undo', theme, {
      userAction: 'user pressed Reset task',
      expectations: ['footer status "Back to built-in" with an Undo text button'],
      overlay: true,
    });
    await closeDialogs(page);
    await page.close();

    // A slow write: the footer says "Saving..." once a write takes longer than 300 ms (spec 5.1).
    const slowWrites = `(() => { const set = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = (...a) => new Promise((r) => setTimeout(() => r(set(...a)), 3000)); })();`;
    page = await openOptionsState(theme, { tab: 'tasks', init: slowWrites });
    dialog = await openTaskDialog(page, 'summarize');
    await dialog
      .locator('[data-ega-template-system] textarea, textarea[data-ega-template-system]')
      .first()
      .fill('Summarize the text in one short sentence.');
    await expect(page.locator('[data-ega-dialog-status]')).toContainText(/Saving/, {
      timeout: 5_000,
    });
    await optShot(page, 'task-dialog-saving', theme, {
      userAction: 'user changed the instructions while the write was slow',
      expectations: ['footer status "Saving..." until the write lands'],
      overlay: true,
    });
    await page.close();

    page = await openOptionsState(theme, { tab: 'tasks' });
    dialog = await openTaskDialog(page, 'summarize');
    const instructions = dialog
      .locator('[data-ega-template-system] textarea, textarea[data-ega-template-system]')
      .first();
    await instructions.fill('Summarize the text in two short sentences.');
    await expect(page.locator('[data-ega-dialog-status]')).toContainText(/Saved/);
    await expect(dialog.locator('[data-ega-prompt-edited]').first()).toBeVisible();
    await optShot(page, 'task-dialog-saved', theme, {
      userAction: 'user changed the Summarize instructions',
      expectations: ['footer status "Saved"; the prompt shows Edited'],
      overlay: true,
    });
    const message = dialog
      .locator('[data-ega-template-user] textarea, textarea[data-ega-template-user]')
      .first();
    await message.fill('');
    await message.blur();
    await expect(dialog.locator('[data-ega-prompt-error]').first()).toBeVisible();
    await dialog.locator('[data-ega-prompt-error]').first().scrollIntoViewIfNeeded();
    await optShot(page, 'task-dialog-invalid-message', theme, {
      userAction: 'user emptied the Message field',
      expectations: ['an error under Message that says what is missing; nothing was saved'],
      overlay: true,
    });
    await closeDialogs(page);
    const keep = page.getByRole('button', { name: /^(Close anyway|Discard)$/ });
    if (await keep.isVisible().catch(() => false)) await keep.click();
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'tasks',
      seed: {
        advanced: {
          // Instructions before the format line, so the way back to the standard format shows.
          promptTemplate: {
            system:
              'You are a translator for this user.\nReturn JSON ONLY: {"translation": "<the translated text>"}.',
            user: '{{text}}',
          },
          templateVersion: 0,
        },
      },
    });
    dialog = await openTaskDialog(page, 'translate');
    await expect(dialog.locator('[data-ega-tpl-version-banner]')).toBeVisible();
    await optShot(page, 'task-dialog-version-notice', theme, {
      userAction: 'user opened Translate with a prompt from an older version',
      expectations: [
        '"A newer built-in Translate prompt is available" with Show changes, Use the new prompt, Keep mine',
      ],
      overlay: true,
    });
    await expect(dialog.locator('[data-ega-use-standard-format]')).toBeVisible();
    await dialog.locator('[data-ega-answer-format-own]').scrollIntoViewIfNeeded();
    await optShot(page, 'task-dialog-answer-format-legacy', theme, {
      userAction: 'user scrolled to the prompt, which writes its own answer format line',
      expectations: [
        'the locked Answer format notes the prompt has its own format line, with the way back to the standard one',
      ],
      overlay: true,
    });
    await dialog.locator('[data-ega-tpl-show-diff]').click();
    await page.locator('.ega-dialog').nth(1).waitFor();
    await optShot(page, 'task-dialog-template-diff', theme, {
      userAction: 'user pressed Show changes',
      expectations: [
        'the two prompts side by side, the changed lines marked; headings in sentence case',
        'the diff covers the task dialog under it; only the diff is lit',
      ],
      overlay: true,
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-ega-diff-modal]')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Use the new prompt' }).click();
    await expect(page.locator('[data-ega-dialog-status]')).toContainText(/new prompt/i);
    await optShot(page, 'task-dialog-use-new-prompt-undo', theme, {
      userAction: 'user pressed Use the new prompt',
      expectations: ['footer status "Updated to the new prompt" with an Undo text button'],
      overlay: true,
    });
    await closeDialogs(page);
    await page.close();
  }
});

test('Options Tasks — a task of your own: new, edit, invalid, preview, delete, close (light + dark)', async () => {
  test.setTimeout(600_000);
  for (const theme of OPT_THEMES) {
    let page = await openOptionsState(theme, { tab: 'tasks' });
    await page.locator('[data-ega-custom-task-new], [data-ega-empty-state] button').first().click();
    let dialog = page.locator('[data-ega-custom-task-dialog]');
    await dialog.waitFor();
    await optShot(page, 'custom-task-new-empty', theme, {
      userAction: 'user pressed New task',
      expectations: [
        'Name first, then Inputs, Answers, then the prompt; "Not saved yet" in the footer',
      ],
      overlay: true,
    });
    await dialog
      .locator('[data-ega-custom-task-name] input, input[data-ega-custom-task-name]')
      .first()
      .fill('Tweet summary');
    await dialog
      .locator('[data-ega-template-system] textarea, textarea[data-ega-template-system]')
      .first()
      .fill('Summarize the text as one short tweet.');
    await expect(page.locator('[data-ega-dialog-status]')).toContainText(/Saved/);
    await dialog.locator('[data-ega-custom-task-menu]').check();
    await optShot(page, 'custom-task-new-valid', theme, {
      userAction: 'user named the task and wrote its instructions',
      expectations: ['footer status "Saved"; the task now shows in Your tasks behind the dialog'],
      overlay: true,
    });
    await dialog.locator('[data-ega-prompt-tab="preview"]').click();
    await optShot(page, 'custom-task-preview', theme, {
      userAction: 'user pressed Preview',
      expectations: [
        'the built prompt with the sample text, the same Preview as the built-in tasks',
      ],
      overlay: true,
    });
    await dialog.locator('[data-ega-prompt-tab="edit"]').click();
    await dialog
      .locator('[data-ega-template-user] textarea, textarea[data-ega-template-user]')
      .first()
      .fill('');
    await page.keyboard.press('Tab');
    await expect(dialog.locator('[data-ega-prompt-error]').first()).toBeVisible();
    await dialog.locator('[data-ega-prompt-error]').first().scrollIntoViewIfNeeded();
    await optShot(page, 'custom-task-invalid', theme, {
      userAction: 'user emptied the Message',
      expectations: ['a field error under Message; the last valid version stays saved'],
      overlay: true,
    });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Close without this change?' }).waitFor();
    // Spec 5.1: the confirm opens on its safe button.
    await expect(page.locator('[data-ega-confirm-safe]')).toBeFocused();
    await optShot(page, 'custom-task-close-confirm', theme, {
      userAction: 'user pressed Esc with an invalid change',
      expectations: ['"Close without this change?" with Keep editing and Close anyway'],
      overlay: true,
    });
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await closeDialogs(page);
    const anyway = page.getByRole('button', { name: 'Close anyway' });
    if (await anyway.isVisible().catch(() => false)) await anyway.click();
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'tasks',
      storage: { 'ega.customTasks': [customTask()] },
    });
    await page.getByRole('button', { name: /^Edit Tweet summary$/ }).click();
    dialog = page.locator('[data-ega-custom-task-dialog]');
    await dialog.waitFor();
    await optShot(page, 'custom-task-edit', theme, {
      userAction: 'user opened their Tweet summary task',
      expectations: ['the saved name and prompt; Delete task in the footer start'],
      overlay: true,
    });
    await page.locator('[data-ega-custom-task-delete]').click();
    await page.locator('[data-sonner-toast]').first().waitFor();
    await optShot(page, 'custom-task-delete-toast', theme, {
      userAction: 'user deleted the task',
      expectations: ['the dialog closes; a toast names the task with Undo; focus is not lost'],
    });
    await page.close();

    // A draft that was never saved asks before it is thrown away (spec 5.1).
    page = await openOptionsState(theme, { tab: 'tasks' });
    await page.locator('[data-ega-custom-task-new], [data-ega-empty-state] button').first().click();
    dialog = page.locator('[data-ega-custom-task-dialog]');
    await dialog.waitFor();
    await dialog
      .locator('[data-ega-template-system] textarea, textarea[data-ega-template-system]')
      .first()
      .fill('Turn it into a polite email reply.');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Discard this task?' }).waitFor();
    await optShot(page, 'custom-task-discard-confirm', theme, {
      userAction: 'user pressed Esc on a new task that has text but no name',
      expectations: [
        '"Discard this task?" with Keep editing focused and Discard; it covers the task dialog',
      ],
      overlay: true,
    });
    await page.getByRole('button', { name: 'Discard' }).click();
    await page.close();

    // Spec 5.3: the task was deleted in another window while its dialog was open.
    page = await openOptionsState(theme, {
      tab: 'tasks',
      storage: { 'ega.customTasks': [customTask()] },
    });
    await page.getByRole('button', { name: /^Edit Tweet summary$/ }).click();
    dialog = page.locator('[data-ega-custom-task-dialog]');
    await dialog.waitFor();
    await page.evaluate(async () => {
      await chrome.storage.local.set({ 'ega.customTasks': [] });
    });
    await dialog
      .locator('[data-ega-custom-task-name] input, input[data-ega-custom-task-name]')
      .first()
      .fill('Tweet summary, short');
    await expect(dialog.getByText('This task was deleted in another window')).toBeVisible({
      timeout: 5_000,
    });
    await optShot(page, 'custom-task-deleted-elsewhere', theme, {
      userAction: 'the task was deleted in another window while the user edited its name',
      expectations: ['"This task was deleted in another window" at the top of the body with Close'],
      overlay: true,
    });
    await page.close();
  }
});

test('Options Selection and picker — Never, picker off, recording a shortcut, a clash (light + dark)', async () => {
  test.setTimeout(600_000);
  for (const theme of OPT_THEMES) {
    let page = await openOptionsState(theme, { tab: 'selection-bubble' });
    await page.locator('[data-ega-bubble-mode]').getByText('Never', { exact: true }).click();
    await optShot(page, 'selection-never', theme, {
      userAction: 'user set the selection bubble to Never',
      expectations: ['Never is selected; the Shortest selection slider under Smart is hidden'],
    });
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'selection-bubble',
      seed: { pickerEnabled: false },
    });
    await centerOn(page, '[data-ega-setting="display.pickerShortcut"]');
    await optShot(page, 'selection-picker-off', theme, {
      userAction: 'user turned the element picker off',
      expectations: [
        'the Element picker shortcut row is dimmed with the visible reason "Turn on the element picker to use this shortcut"',
      ],
    });
    await page.close();

    page = await openOptionsState(theme, { tab: 'selection-bubble' });
    const row = page.locator('[data-ega-setting="display.shortcut"]');
    await row.locator('[data-ega-shortcut-record]').click();
    await expect(row).toContainText('Press keys');
    await centerOn(page, '[data-ega-setting="display.shortcut"]');
    await optShot(page, 'shortcut-recording', theme, {
      userAction: 'user pressed the Translate selection shortcut to record a new one',
      expectations: ['the field reads "Press keys..."; Esc cancels'],
    });
    await page.keyboard.press('Control+Shift+E');
    await expect(row).toContainText('already the');
    await optShot(page, 'shortcut-conflict', theme, {
      userAction: 'user pressed the combo the element picker already uses',
      expectations: [
        '"Ctrl+Shift+E is already the Element picker shortcut. Pick another." under the row; nothing saved',
      ],
    });
    await page.close();
  }
});

/** The fake native host: it answers a ping with `version` and lists the CLIs it finds. */
function fakeNativeHost(version: number, cli: Record<string, string | null>): string {
  return `(() => {
    chrome.runtime.connectNative = () => {
      const listeners = []; const ends = [];
      const port = {
        name: 'ega-e2e-fake',
        onMessage: { addListener: (f) => listeners.push(f), removeListener: () => {} },
        onDisconnect: { addListener: (f) => ends.push(f), removeListener: () => {} },
        disconnect: () => {},
        postMessage: (m) => setTimeout(() => {
          const say = (x) => listeners.forEach((f) => f({ id: m.id, ...x }));
          if (m.kind === 'ping') say({ type: 'pong', hostVersion: ${version} });
          else if (m.kind === 'probe-cli') {
            say({ type: 'cli-presence', cli: ${JSON.stringify(cli)} });
            say({ type: 'cli-login', loggedIn: { claude: true, codex: true } });
            say({ type: 'done' });
          } else if (m.kind === 'list-models') { say({ type: 'models', models: ['sonnet', 'haiku'] }); say({ type: 'done' }); }
          else say({ type: 'done' });
        }, 20),
      };
      return port;
    };
  })();`;
}

async function expandBackend(page: Page, id: string): Promise<Locator> {
  const card = page.locator(`details[data-backend-id="${id}"]`);
  await card.locator('summary').first().click();
  await expect(card).toHaveAttribute('open', '');
  await card.scrollIntoViewIfNeeded();
  return card;
}

test('Options Backends — the list, cloud cards, local cards and the native host (light + dark)', async () => {
  test.setTimeout(900_000);
  for (const theme of OPT_THEMES) {
    let page = await openOptionsState(theme, { fresh: true, tab: 'backends' });
    await expect(page.locator('[data-ega-get-started]')).toBeVisible();
    await expect(page.locator('[data-ega-depth-note]')).toContainText('No backend is ready');
    await optShot(page, 'backends-get-started', theme, {
      userAction: 'user opened Backends on a fresh install',
      expectations: [
        'Get started card: primary "Use a free Gemini key", two secondary, ghost "Skip for now"',
      ],
    });
    await page.locator('[data-ega-onboard]').first().click();
    await page.waitForTimeout(300); // wait for the Gemini row to open and take focus (no single end state)
    await optShot(page, 'backends-after-get-started', theme, {
      userAction: 'user pressed Use a free Gemini key',
      expectations: ['the Gemini row is open with its key field focused'],
      viewportOnly: true,
    });
    await page.close();

    page = await openOptionsState(theme, { fresh: true, tab: 'backends' });
    await page.locator('[data-ega-onboard="dismiss"]').click();
    await expect(page.locator('[data-ega-get-started]')).toHaveCount(0);
    await optShot(page, 'backends-after-skip', theme, {
      userAction: 'user pressed Skip for now on a fresh install',
      expectations: [
        'the Get started card is gone; one notice says no backend is set up, with no button on this tab',
      ],
    });
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'backends',
      seed: {
        geminiApiKey: 'AIza-audit',
        groqApiKey: 'gsk-audit',
        backendOrder: ['anthropic', 'gemini', 'groq', 'native', 'ollama'],
        disabledBackends: [],
      },
    });
    await expect(page.locator('[data-ega-route="first"]')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('[data-ega-depth-note]')).toHaveCount(0);
    await optShot(page, 'backends-configured', theme, {
      userAction: 'user has three cloud keys, the native host and Ollama in use, and tries 2',
      expectations: [
        'Try up to N backends first; then one row each: position, name, status pill, route tag',
        '"First choice", then "Backup 1", then "Not reached" on the third ready row; "Skipped" on the rest',
      ],
    });
    await page.locator('[data-ega-depth="4"]').click();
    await expect(page.locator('[data-ega-depth-note]')).toContainText('Only 3 backends are ready');
    await optShot(page, 'backends-depth-note', theme, {
      userAction: 'user asked for four backends with only three ready',
      expectations: ['"Only 3 backends are ready, so Ega tries 3" under Try up to'],
    });
    await page.close();

    // Groq reads no images, so the next ready backend that does is tagged for them.
    page = await openOptionsState(theme, {
      tab: 'backends',
      seed: {
        groqApiKey: 'gsk-audit',
        backendOrder: ['groq', 'anthropic', 'gemini', 'native'],
        disabledBackends: [],
      },
    });
    await expect(page.locator('[data-ega-route="first-for-images"]')).toHaveCount(1, {
      timeout: 10_000,
    });
    await optShot(page, 'backends-first-for-images', theme, {
      userAction: 'user put Groq, which reads no images, first in line',
      expectations: ['Groq is "First choice"; Anthropic carries "First for images"'],
    });
    await page.close();

    // A cloud row under Not in use, opened (F66).
    page = await openOptionsState(theme, { tab: 'backends' });
    await expandBackend(page, 'openai');
    await optShot(page, 'backend-cloud-not-in-use-expanded', theme, {
      userAction: 'user opened the OpenAI row, which is not in use',
      expectations: [
        'Enable is the action; the model field says "Enable this backend to pick a model" and looks unavailable',
      ],
    });
    await page.close();

    // Every probe hangs: the service worker's probe, the native host port and the local servers.
    const checking = `(() => { const s = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = (m, ...r) => m && m.kind === 'backend:probe-all' ? new Promise(() => {}) : s(m, ...r);
      const quiet = { addListener() {}, removeListener() {} };
      chrome.runtime.connectNative = () => ({ postMessage() {}, disconnect() {}, onMessage: quiet, onDisconnect: quiet });
      const f = window.fetch.bind(window);
      window.fetch = (u, ...r) => /localhost|127.0.0.1/.test(String(u)) ? new Promise(() => {}) : f(u, ...r); })();`;
    page = await openOptionsState(theme, { tab: 'backends', init: checking });
    await optShot(page, 'backends-checking', theme, {
      userAction: 'user opened Backends while the readiness check was still running',
      expectations: ['rows read "Checking..." with no route tag guess'],
    });
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'backends',
      seed: {
        disabledBackends: [
          'anthropic',
          'gemini',
          'native',
          'openai',
          'groq',
          'deepseek',
          'together',
          'mistral',
          'xai',
          'fireworks',
          'openrouter',
          'ollama',
          'localserver',
        ],
      },
    });
    await optShot(page, 'backends-all-disabled', theme, {
      userAction: 'user disabled every backend',
      expectations: [
        'Backends in use says nothing can answer; every row waits under Not in use with Enable',
      ],
    });
    await page.close();

    // Cloud card states.
    page = await openOptionsState(theme, { tab: 'backends', seed: { disabledBackends: [] } });
    await expandBackend(page, 'groq');
    await optShot(page, 'backend-cloud-expanded-empty', theme, {
      userAction: 'user opened the Groq row with no key',
      expectations: ['numbered steps: key with the sign-up link, then model; "Needs setup" pill'],
    });
    await page.close();

    await ext.context.route('https://api.anthropic.com/v1/models**', () => new Promise(() => {}));
    page = await openOptionsState(theme, { tab: 'backends' });
    await expandBackend(page, 'anthropic');
    await expect(page.locator('[data-ega-backend-test="anthropic"]')).toBeVisible();
    await optShot(page, 'backend-cloud-key-saved', theme, {
      userAction: 'user opened the Anthropic row with a saved key',
      expectations: ['"Key saved" pill; the key field masked; Test is available'],
    });
    // The models request hangs, so the list stays loading after Refresh.
    await page
      .locator('details[data-backend-id="anthropic"]')
      .getByRole('button', { name: /Refresh model list|Loading models/ })
      .click();
    await expect(
      page
        .locator('details[data-backend-id="anthropic"]')
        .getByRole('button', { name: /Loading models/ }),
    ).toBeVisible();
    await optShot(page, 'backend-cloud-models-loading', theme, {
      userAction: 'user pressed Refresh and the model list is still loading',
      expectations: ['the model field says it is loading, without a spinner that hides the field'],
    });
    await page.close();
    await resetRoutes(ext.context);

    await ext.context.route('https://api.anthropic.com/v1/models**', (r) =>
      r.fulfill({ status: 500, body: '{"error":{"message":"upstream"}}' }),
    );
    page = await openOptionsState(theme, { tab: 'backends' });
    const models = await expandBackend(page, 'anthropic');
    await models.getByRole('button', { name: 'Refresh model list from the backend' }).click();
    await expect(models.getByText(/^Could not load the model list/)).toBeVisible();
    await optShot(page, 'backend-cloud-models-error', theme, {
      userAction: 'the model list request failed',
      expectations: ['a plain line that the list did not load and a typed model still works'],
    });
    await page.close();
    await resetRoutes(ext.context);

    mockAnthropic(ext.context, { delayMs: 8_000 });
    page = await openOptionsState(theme, { tab: 'backends' });
    await expandBackend(page, 'anthropic');
    await page.getByTestId('backend-card-test-anthropic').click();
    await page.waitForTimeout(300); // wait for the Testing state to paint (no single end state)
    await optShot(page, 'backend-cloud-testing', theme, {
      userAction: 'user pressed Test',
      expectations: ['Test shows its busy state; nothing else moves'],
    });
    await page.close();
    await resetRoutes(ext.context);

    mockAnthropic(ext.context, { translation: 'Hello my friend, how are you today?' });
    page = await openOptionsState(theme, { tab: 'backends' });
    let card = await expandBackend(page, 'anthropic');
    await page.getByTestId('backend-card-test-anthropic').click();
    await expect(card.locator('[data-ega-backend-status="Verified"]')).toBeVisible({
      timeout: 10_000,
    });
    await optShot(page, 'backend-cloud-verified', theme, {
      userAction: 'the key test passed',
      expectations: ['"Verified" pill with when; the sample answer under Test'],
    });
    await page.close();
    await resetRoutes(ext.context);

    await ext.context.route('https://api.anthropic.com/v1/messages', (r) =>
      r.fulfill({
        status: 401,
        body: JSON.stringify({
          type: 'error',
          error: { type: 'authentication_error', message: 'invalid x-api-key' },
        }),
      }),
    );
    page = await openOptionsState(theme, { tab: 'backends' });
    card = await expandBackend(page, 'anthropic');
    await page.getByTestId('backend-card-test-anthropic').click();
    await expect(card.locator('[data-ega-test-failure]')).toBeVisible({ timeout: 10_000 });
    await optShot(page, 'backend-cloud-key-error', theme, {
      userAction: 'the key test was rejected',
      expectations: [
        '"Test failed" pill; the line "API key rejected" with what to do; the raw reply under Details',
      ],
    });
    await card.locator('[data-ega-test-failure] summary').first().click();
    await optShot(page, 'backend-cloud-test-failed-details', theme, {
      userAction: 'user opened Details under the failed test',
      expectations: [
        'the provider reply in monospace under Details; the plain line above it stays',
      ],
    });
    await page.close();
    await resetRoutes(ext.context);

    await ext.context.route('https://api.anthropic.com/v1/messages', (r) =>
      r.abort('connectionreset'),
    );
    page = await openOptionsState(theme, { tab: 'backends' });
    card = await expandBackend(page, 'anthropic');
    await page.getByTestId('backend-card-test-anthropic').click();
    await expect(card.locator('[data-ega-test-failure]')).toBeVisible({ timeout: 10_000 });
    await optShot(page, 'backend-cloud-test-failed', theme, {
      userAction: 'the key test could not reach the provider',
      expectations: ['"No connection" with what to check; Test can run again'],
    });
    await page.close();
    await resetRoutes(ext.context);

    // Local backends: the defaults are blocked, so the rows show what a stopped server looks like.
    page = await openOptionsState(theme, { tab: 'backends', seed: { disabledBackends: [] } });
    card = await expandBackend(page, 'ollama');
    await optShot(page, 'backend-ollama-expanded', theme, {
      userAction: 'user opened the Ollama row',
      expectations: ['steps: Address (Ollama URL), then Model with Discover models'],
    });
    await card.getByRole('button', { name: /Discover models/ }).click();
    await expect(card.getByText(/did not answer/)).toBeVisible({ timeout: 10_000 });
    await optShot(page, 'backend-ollama-url-error', theme, {
      userAction: 'user pressed Discover models with Ollama stopped',
      expectations: [
        '"Ollama did not answer at this address. Check that it is running." with Details',
      ],
    });
    await page.close();

    await ext.context.route('http://localhost:11434/api/tags', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ models: [{ name: 'qwen2.5:7b', size: 4_700_000_000 }] }),
      }),
    );
    await ext.context.route('http://localhost:11434/api/chat', (r) =>
      r.fulfill({ status: 403, body: '' }),
    );
    page = await openOptionsState(theme, { tab: 'backends', seed: { disabledBackends: [] } });
    card = await expandBackend(page, 'ollama');
    await card.getByRole('button', { name: /Discover models/ }).click();
    await expect(card.getByText(/blocked the request/)).toBeVisible({ timeout: 10_000 });
    await card.getByText('Show steps').click();
    await expect(card.locator('[data-ega-ollama-origin-steps]')).toBeVisible();
    await optShot(page, 'backend-ollama-403-steps', theme, {
      userAction: 'Ollama listed its models but refused requests from the extension',
      expectations: [
        '"Ollama blocked the request from Ega" with the steps open: the origin, Copy, and the command per OS',
      ],
    });
    await page.close();
    await resetRoutes(ext.context);

    page = await openOptionsState(theme, { tab: 'backends', seed: { disabledBackends: [] } });
    card = await expandBackend(page, 'localserver');
    await optShot(page, 'backend-localserver-expanded', theme, {
      userAction: 'user opened the Local server row',
      expectations: ['the address with the presets as pressed buttons; the hint about no API key'],
    });
    await card.locator('[data-ega-setting="backends.localServerUrl"]').fill('http://localhost:9');
    await card.locator('[data-ega-setting="backends.localServerUrl"]').blur();
    // The address is checked when the model list is fetched.
    await card.getByRole('button', { name: 'Refresh model list from the backend' }).click();
    await expect(card.getByText(/No server answered/)).toBeVisible({ timeout: 10_000 });
    await optShot(page, 'backend-localserver-url-error', theme, {
      userAction: 'user typed an address where nothing runs',
      expectations: [
        '"No server answered at this address. Check that it is running." with Details',
      ],
    });
    await page.close();

    page = await openOptionsState(theme, { tab: 'backends' });
    card = await expandBackend(page, 'native');
    await expect(card.locator('[data-testid="nh-status-pill"]')).toContainText('Not installed', {
      timeout: 10_000,
    });
    await optShot(page, 'backend-native-not-installed', theme, {
      userAction: 'user opened the native host row with no host installed',
      expectations: [
        '"Not installed" pill; the install steps with Copy; the (i) about the native host',
      ],
    });
    const steps = card.getByText('Show install steps').first();
    if (await steps.isVisible().catch(() => false)) {
      await steps.click();
      await optShot(page, 'backend-native-steps-open', theme, {
        userAction: 'user opened the steps',
        expectations: ['numbered steps; commands in monospace; nothing cut off'],
      });
    }
    await page.close();

    for (const [state, version, cli] of [
      ['installed', 4, { claude: 'C:/Users/me/AppData/Roaming/npm/claude.cmd', codex: null }],
      ['outdated', 3, { claude: 'C:/Users/me/AppData/Roaming/npm/claude.cmd', codex: null }],
      ['cli-missing', 4, { claude: null, codex: null }],
    ] as const) {
      page = await openOptionsState(theme, { tab: 'backends', init: fakeNativeHost(version, cli) });
      await expandBackend(page, 'native');
      await page.waitForTimeout(800); // wait for the ping and the CLI probe (no single end state)
      await optShot(page, `backend-native-${state}`, theme, {
        userAction: `the native host answered as ${state}`,
        expectations:
          state === 'installed'
            ? ['"Installed"; the CLI picker; Start the native host with Chrome with its hint']
            : state === 'outdated'
              ? ['"Update needed" with the update step']
              : ['"Claude Code was not found on this computer" with Show steps (PATH)'],
      });
      await page.close();
    }

    page = await openOptionsState(theme, { tab: 'backends', seed: { geminiApiKey: 'AIza-audit' } });
    const handle = page.locator('[data-be-row-id="gemini"] .be-gutter');
    const box = await handle.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y - 40, { steps: 8 });
      await optShot(page, 'backends-drag-in-progress', theme, {
        userAction: 'user is dragging the Gemini row above Anthropic',
        expectations: ['the dragged row lifts; a drop slot shows where it lands'],
        viewportOnly: true,
        skipPark: true,
      });
      await page.mouse.up();
    }
    await page.close();
  }
});

const CUSTOM_LANG = (n: number, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: `audit-lang-${n}`,
  label: n === 0 ? 'Pirate English' : `Slang ${n}`,
  hint: 'Short, playful sentences with pirate words.',
  examples: [{ src: 'Hello, friend', tgt: 'Ahoy, matey' }],
  createdAt: n + 1,
  ...over,
});

test('Options Languages — the list and the language dialog (light + dark)', async () => {
  test.setTimeout(900_000);
  for (const theme of OPT_THEMES) {
    let page = await openOptionsState(theme, { tab: 'languages' });
    await optShot(page, 'languages-default', theme, {
      userAction: 'user opened Languages',
      expectations: [
        'Default languages with both pickers the same width; Slang and special languages list with checkboxes and Edit',
      ],
    });
    await page.getByLabel('Filter languages').fill('zzzz');
    await centerOn(page, '[data-ega-variety-filter]');
    await optShot(page, 'languages-filter-no-results', theme, {
      userAction: 'user filtered for a name no language has',
      expectations: ['"No language matches "zzzz"" with a ghost Clear filter'],
    });
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'languages',
      storage: { 'ega.customLanguages': Array.from({ length: 20 }, (_, n) => CUSTOM_LANG(n + 1)) },
    });
    await optShot(page, 'languages-many', theme, {
      userAction: 'user has twenty languages of their own',
      expectations: [
        'every row one line: checkbox, name, Custom badge, example count, Edit; the list does not stretch the page oddly',
      ],
    });
    await page.close();

    page = await openOptionsState(theme, { tab: 'languages' });
    let dialog = await openLanguageDialog(page, 'arabizi', 'Arabizi');
    await expect(dialog.locator('[data-ega-language-shown]')).toBeVisible();
    await optShot(page, 'language-dialog-built-in', theme, {
      userAction: 'user opened Arabizi',
      expectations: [
        'Notes with a counter, Examples with Original and Translation headers, Show in language pickers, the Prompt choice',
      ],
      overlay: true,
    });
    await dialog.locator('[data-ega-language-detect] > summary').click();
    await expect(dialog.getByLabel(/^Pattern/).first()).toBeVisible();
    await optShot(page, 'language-dialog-detect-open', theme, {
      userAction: 'user opened Auto-detect pattern',
      expectations: ['the pattern field and flags with the (i)'],
      overlay: true,
    });
    const pattern = dialog.getByLabel(/^Pattern/).first();
    await pattern.fill('([a-z');
    await pattern.blur();
    await expect(dialog.locator('.ld-error')).toBeVisible();
    await optShot(page, 'language-dialog-detect-invalid', theme, {
      userAction: 'user typed a pattern that does not parse',
      expectations: ['a field error that says what is wrong; nothing saved'],
      overlay: true,
    });
    // An empty pattern is valid again, so closing asks nothing.
    await pattern.fill('');
    await pattern.blur();
    await closeDialogs(page);
    dialog = await openLanguagePrompt(page, 'arabizi', 'Arabizi');
    await expect(dialog.locator('[data-ega-language-prompt-mode]')).toBeVisible();
    await expect(dialog.locator('[data-ega-language-prompt]')).toBeVisible();
    // From the section's own "Prompt" label, so the shot shows the section heading above the editor.
    const toPrompt = (): Promise<void> =>
      dialog
        .locator('[data-ega-language-prompt]')
        .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await toPrompt();
    await optShot(page, 'language-dialog-own-prompt', theme, {
      userAction: 'user picked Use its own prompt',
      expectations: ['the shared prompt editor appears under the choice'],
      overlay: true,
    });
    await dialog.locator('[data-ega-prompt-tab="preview"]').click();
    await toPrompt();
    await optShot(page, 'language-dialog-own-prompt-preview', theme, {
      userAction: 'user pressed Preview',
      expectations: ['the built prompt for this language'],
      overlay: true,
    });
    await closeDialogs(page);
    await page.close();

    page = await openOptionsState(theme, { tab: 'languages' });
    await page.locator('[data-ega-language-add]').click();
    await page.locator('.ega-dialog').waitFor();
    await expect(page.locator('[data-ega-language-name]')).toBeVisible();
    await optShot(page, 'language-dialog-custom-new', theme, {
      userAction: 'user pressed Add language',
      expectations: [
        'Name first, then Notes and Examples; "Not saved yet: add a name" in the footer',
      ],
      overlay: true,
    });
    // A draft with text and no name asks before it is thrown away (spec 5.1).
    await page
      .locator('[data-ega-language-notes] textarea, textarea[data-ega-language-notes]')
      .first()
      .fill('Short sentences with pirate words.');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Discard this language?' }).waitFor();
    await optShot(page, 'language-dialog-discard-confirm', theme, {
      userAction: 'user pressed Esc on a new language that has notes but no name',
      expectations: ['"Discard this language?" with Keep editing focused and Discard'],
      overlay: true,
    });
    await page.getByRole('button', { name: 'Discard' }).click();
    await page.close();

    // Spec 5.4: Reset language on an edited built-in shows "Back to built-in" with Undo.
    page = await openOptionsState(theme, { tab: 'languages' });
    dialog = await openLanguageDialog(page, 'arabizi', 'Arabizi');
    await dialog
      .locator('[data-ega-language-notes] textarea, textarea[data-ega-language-notes]')
      .first()
      .fill('Arabic written in Latin letters, with digits for sounds Latin lacks.');
    await expect(page.locator('[data-ega-dialog-status]')).toContainText(/Saved/, {
      timeout: 5_000,
    });
    await page.locator('.ega-dialog [data-ega-section-reset]').click();
    await expect(page.locator('[data-ega-dialog-status]')).toContainText(/built-in/i);
    await optShot(page, 'language-dialog-reset-undo', theme, {
      userAction: 'user pressed Reset language after editing the notes',
      expectations: ['footer status "Back to built-in" with an Undo text button'],
      overlay: true,
    });
    await closeDialogs(page);
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'languages',
      storage: { 'ega.customLanguages': [CUSTOM_LANG(0)] },
      init: 'chrome.storage.onChanged.addListener = () => {};',
    });
    dialog = await openLanguageDialog(page, 'audit-lang-0', 'Pirate English');
    await expect(page.locator('[data-ega-language-export]')).toBeVisible();
    await optShot(page, 'language-dialog-custom-edit', theme, {
      userAction: 'user opened their Pirate English language',
      expectations: ['the saved name, notes and example; Delete language and Export in the footer'],
      overlay: true,
    });
    await page.evaluate(async () => {
      const k = 'ega.customLanguages';
      const rows = (await chrome.storage.local.get(k))[k] as Record<string, unknown>[];
      await chrome.storage.local.set({
        [k]: rows.map((r) => ({ ...r, hint: 'Changed in another window.' })),
      });
    });
    const notes = dialog
      .locator('[data-ega-language-notes] textarea, textarea[data-ega-language-notes]')
      .first();
    await notes.fill('Short sentences, many pirate words.');
    await notes.blur();
    await expect(dialog.locator('[data-ega-language-conflict]')).toBeVisible({ timeout: 5_000 });
    await optShot(page, 'language-dialog-conflict', theme, {
      userAction: 'the language changed in another window while the user edited Notes',
      expectations: [
        '"Changed in another window" with Reload language; the edit was not written over the other one',
      ],
      overlay: true,
    });
    // Delete language sits in the dialog footer, outside the language body.
    await page.locator('.ega-dialog [data-ega-language-delete]').click();
    await page.locator('[data-sonner-toast]').first().waitFor();
    await optShot(page, 'language-dialog-delete-toast', theme, {
      userAction: 'user deleted the language',
      expectations: ['the dialog closes; a toast with Undo; the row is gone'],
    });
    await page.close();
  }
});

const RULE = (
  id: string,
  body: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id,
  body,
  category: 'always',
  scope: { tasks: [] },
  source: 'manual',
  addedAt: '2026-10-01T00:00:00.000Z',
  enabled: true,
  ...over,
});

test('Options Glossary and rules — entries and rules in every state (light + dark)', async () => {
  test.setTimeout(900_000);
  const entries = [
    { term: 'checkout', translation: 'caja', caseSensitive: false },
    { term: 'cart', translation: 'carrito', caseSensitive: false },
    { term: 'Ega', translation: 'Ega', caseSensitive: true },
  ];
  const rules = [
    RULE('r1', 'Keep product names in English.'),
    RULE('r2', 'Prefer short sentences in summaries.', {
      category: 'prefer',
      scope: { tasks: ['summarize'], sites: ['news.example.com'] },
    }),
    RULE('r3', 'Never translate code blocks.', { category: 'never', enabled: false }),
  ];
  for (const theme of OPT_THEMES) {
    let page = await openOptionsState(theme, {
      tab: 'glossary',
      seed: { glossary: [], advanced: { rules: [] } },
    });
    await optShot(page, 'glossary-empty', theme, {
      userAction: 'user opened Glossary and rules with nothing added',
      expectations: [
        'the add row on top; one EmptyState for the glossary; one for rules with Add rule',
      ],
    });
    await centerOn(page, '[data-ega-rules-empty]');
    await optShot(page, 'rules-empty', theme, {
      userAction: 'user scrolled to Rules with no rule added',
      expectations: ['one EmptyState with its Add rule action, whole on screen; no header button'],
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('[data-ega-glossary-add-button]').click();
    await optShot(page, 'glossary-add-error', theme, {
      userAction: 'user pressed Add with both fields empty',
      expectations: ['"Write a term" under Term; focus in Term'],
    });
    await page.locator('[data-ega-rules-add], [data-ega-rules-empty] button').first().click();
    await page.locator('[data-ega-rule-draft]').waitFor();
    await centerOn(page, '[data-ega-rule-draft]');
    await optShot(page, 'rules-add-open', theme, {
      userAction: 'user pressed Add rule',
      expectations: [
        'the draft opens on top: Rule text, Type, Applies to, Sites; Add rule and Cancel',
      ],
    });
    await page.locator('[data-ega-manual-submit]').click();
    await centerOn(page, '[data-ega-rule-draft]');
    await optShot(page, 'rules-add-error', theme, {
      userAction: 'user pressed Add rule with no text',
      expectations: ['"Write the rule text" under Rule text; nothing added'],
    });
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'glossary',
      seed: { glossary: entries, advanced: { rules } },
    });
    await expect(page.locator('[data-ega-glossary-used-by]')).toBeVisible();
    await optShot(page, 'glossary-populated', theme, {
      userAction: 'user has three glossary entries and three rules',
      expectations: [
        'entries in hairline rows with Edit; rules with a checkbox, the meta line and Edit',
      ],
    });
    await page.locator('[data-ega-glossary-more] > summary').click();
    await expect(page.locator('#gl-add-source')).toBeVisible();
    await optShot(page, 'glossary-more-options', theme, {
      userAction: 'user opened More options in the add row',
      expectations: ['scope fields: source and target language, Match case; the scope note'],
    });
    // A source language other than Auto-detect, while the default source is Auto-detect, brings the note.
    await page.locator('#gl-add-source').selectOption('es');
    await expect(page.locator('[data-ega-glossary-scope-note]')).toBeVisible({ timeout: 5_000 });
    await centerOn(page, '[data-ega-glossary-scope-note]');
    await optShot(page, 'glossary-scope-warning', theme, {
      userAction: 'user picked Spanish as the source of a new entry',
      expectations: ['one line: "Applies only when you pick Spanish as the source"'],
    });
    await page.locator('#gl-add-source').selectOption('');
    await page.locator('[data-ega-glossary-more] > summary').click();
    await page.getByRole('button', { name: 'Edit entry checkout' }).click();
    await centerOn(page, '[data-ega-glossary-editor]');
    await optShot(page, 'glossary-edit-row', theme, {
      userAction: 'user pressed Edit on checkout',
      expectations: ['the inline editor opens under the row; Delete entry inside it'],
    });
    await page.getByRole('button', { name: 'Delete entry checkout' }).click();
    await page.locator('[data-sonner-toast]').first().waitFor();
    await optShot(page, 'glossary-delete-toast', theme, {
      userAction: 'user deleted checkout',
      expectations: ['toast "Deleted "checkout"" with Undo; focus on the next row'],
    });
    await page.locator('[data-ega-rule-edit]').first().click();
    await centerOn(page, '[data-ega-rules-editor]');
    await optShot(page, 'rules-edit-open', theme, {
      userAction: 'user pressed Edit on the first rule',
      expectations: ['the rule editor opens under the row; Close replaces Edit'],
    });
    await page.locator('[data-ega-rule-delete]').first().click();
    await page.locator('[data-sonner-toast]').first().waitFor();
    await optShot(page, 'rules-delete-toast', theme, {
      userAction: 'user deleted the first rule',
      expectations: ['a toast with Undo; the rule is gone'],
    });
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'glossary',
      seed: {
        glossary: [
          {
            term: 'supercalifragilisticexpialidocious onboarding checklist',
            translation: 'lista de verificación de incorporación extraordinariamente larga',
            caseSensitive: false,
          },
        ],
        advanced: {
          rules: [
            RULE(
              'r-long',
              'When the text is a product review, keep the star rating, the reviewer name and every product name exactly as written, and translate everything else into plain everyday words.',
            ),
          ],
        },
      },
    });
    await optShot(page, 'glossary-long-term', theme, {
      userAction: 'user has a very long glossary entry',
      expectations: ['term and translation wrap; nothing cut off; Edit stays on the row'],
    });
    await page.locator('[data-ega-rule-row]').first().scrollIntoViewIfNeeded();
    await optShot(page, 'rules-long-rule', theme, {
      userAction: 'user has a long rule',
      expectations: ['the rule text wraps in full; the meta line under it'],
    });
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'glossary',
      seed: { glossary: entries, advanced: { rules } },
    });
    await page.locator('[data-ega-rule-row]').first().scrollIntoViewIfNeeded();
    await optShot(page, 'rules-populated', theme, {
      userAction: 'user scrolled to Rules',
      expectations: [
        'three rules; the off rule reads clearly; meta lines like "Always · All tasks"',
      ],
    });
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'glossary',
      seed: {
        advanced: {
          rules: Array.from({ length: 100 }, (_, n) => RULE(`r-cap-${n}`, `Rule number ${n + 1}.`)),
        },
      },
    });
    await centerOn(page, '#ega-rules-cap');
    await optShot(page, 'rules-at-cap', theme, {
      userAction: 'user has 100 rules, the most Ega keeps',
      expectations: ['Add rule says why it does nothing, in visible text'],
    });
    await page.close();

    // A glossary file with one broken entry: the rest imports and the line says what was skipped.
    page = await openOptionsState(theme, { tab: 'glossary', seed: { glossary: [] } });
    const chooser = page.waitForEvent('filechooser');
    await page
      .getByText(/^Import glossary/)
      .first()
      .click();
    await (
      await chooser
    ).setFiles({
      name: 'ega-glossary.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          egaGlossary: {
            v: 1,
            entries: [{ term: 'checkout', translation: 'caja', caseSensitive: false }, { term: 7 }],
          },
        }),
      ),
    });
    const addEntries = page.getByRole('dialog', { name: 'Add glossary entries?' });
    await addEntries.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText(/Skipped 1 broken or unknown entry/)).toBeVisible();
    await centerOn(page, '[data-ega-backup-restore-row]');
    await optShot(page, 'glossary-import-partial', theme, {
      userAction: 'user imported a glossary file with one broken entry',
      expectations: ['"Added 1 entry. Skipped 1 broken or unknown entry." under the buttons'],
    });
    await page.close();
  }
});

/** First messages for the seeded rows, in the index shape the side panel writes (title, message count); the last row has no facts, as one saved before them. */
const CONV_TITLES = [
  'Hola, ¿cómo estás?',
  'What does "on the fence" mean here?',
  null,
  'Summarize this release note for the team in two short sentences, keeping the version numbers',
  'Bonjour tout le monde',
];

function conversations(n: number, now: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const threads: unknown[] = [];
  for (let i = 0; i < n; i++) {
    // Two conversations on site1: a site can hold several, each id "<site>#<suffix>".
    const site = i === 0 ? 'general' : `https://site${Math.max(1, i - 1)}.example.com`;
    const origin = i === 1 || i === 2 ? `${site}#c${i}` : site;
    const turns = [
      {
        id: `t${i}`,
        role: 'user',
        kind: 'translate',
        status: 'idle',
        content: `hola ${i}`,
        createdAt: now - i * 60_000,
      },
    ];
    out[`ega:conv:t:${origin}`] = { version: 1, origin, turns, updatedAt: now - i * 60_000 };
    const title = CONV_TITLES[i];
    const facts =
      i === n - 1
        ? {}
        : title === null
          ? { imageFirst: true, messages: 2 }
          : { ...(title === undefined ? {} : { title }), messages: 2 * i + 2 };
    threads.push({ origin, updatedAt: now - i * 60_000, bytes: 2048 * (i + 1), ...facts });
  }
  out['ega:conv:index'] = { version: 1, threads };
  return out;
}

test('Options Advanced and About — data, diagnostics and about in every state (light + dark)', async () => {
  test.setTimeout(900_000);
  const manySites: Record<string, unknown> = {};
  for (let i = 0; i < 12; i++)
    manySites[`https://site${String(i).padStart(2, '0')}.example.com`] =
      i % 2 === 0 ? { disabled: true } : { disabled: false, defaultLang: 'es' };
  // A host too long for its row: it is cut with an ellipsis, and the full name stays in its title (R17).
  manySites[
    'https://a-really-long-subdomain-name-for-the-audit.some-example-domain-that-keeps-going-on.example.com'
  ] = {
    disabled: true,
  };
  for (const theme of OPT_THEMES) {
    let page = await openOptionsState(theme, { tab: 'advanced', sub: 'data' });
    await optShot(page, 'data-default', theme, {
      userAction: 'user opened Advanced',
      expectations: [
        'Data first: Backup and restore, Site overrides, Saved conversations, Reset and delete; the only red is Delete all data',
      ],
    });
    await page.getByRole('checkbox', { name: 'Include API keys' }).check();
    await optShot(page, 'data-include-keys', theme, {
      userAction: 'user ticked Include API keys',
      expectations: ['the hint "Leave this off for a file you share" stays under it'],
    });
    await page.getByRole('checkbox', { name: 'Include API keys' }).uncheck();

    const chooser = page.waitForEvent('filechooser');
    await page.getByText('Import settings...', { exact: true }).click();
    await (
      await chooser
    ).setFiles({
      name: 'ega-settings-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ version: 1, settings: { theme }, customLanguages: [] })),
    });
    await page.getByRole('dialog', { name: 'Import settings?' }).waitFor();
    await optShot(page, 'data-import-confirm', theme, {
      userAction: 'user picked a backup file',
      expectations: ['"Import settings?" naming the file; Import and Keep current settings'],
      overlay: true,
    });
    await page.getByRole('button', { name: 'Keep current settings' }).click();
    const bad = page.waitForEvent('filechooser');
    await page.getByText('Import settings...', { exact: true }).click();
    await (
      await bad
    ).setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not json') });
    await expect(
      page.getByText('This file is not an Ega backup. Pick a file you exported from Ega.'),
    ).toBeVisible();
    await centerOn(page, '[data-ega-setting="advanced.dataBackup"]');
    await optShot(page, 'data-import-error', theme, {
      userAction: 'user picked a file that is not a backup',
      expectations: ['the status line under the buttons says what to do, in the error tone'],
    });
    await page.locator('[data-ega-reset-defaults]').click();
    await page.locator('[data-sonner-toast]').first().waitFor();
    await optShot(page, 'data-reset-toast', theme, {
      userAction: 'user pressed Reset in Reset and delete',
      expectations: ['"Prompt and model settings are back to defaults" with Undo'],
    });
    await page.close();

    page = await openOptionsState(theme, { tab: 'advanced', sub: 'data' });
    await page.locator('[data-ega-clear-cache]').click();
    await page.locator('[data-sonner-toast]').first().waitFor();
    await optShot(page, 'data-clear-cache-toast', theme, {
      userAction: 'user pressed Clear cache',
      expectations: ['"Saved answers cleared"; no Undo'],
    });
    await page.locator('[data-ega-delete-all]').click();
    await page.locator('[data-ega-delete-all-field]').fill('DELETE');
    await optShot(page, 'delete-all-data-confirm', theme, {
      userAction: 'user pressed Delete all data and typed DELETE',
      expectations: [
        '"Delete all data?" with the list and the bold line; Export all settings first; the red button now works',
      ],
      overlay: true,
    });
    await closeDialogs(page);
    await page.close();

    // A backup from a newer Ega: nothing changes and the line says what to do.
    page = await openOptionsState(theme, { tab: 'advanced', sub: 'data' });
    const newer = page.waitForEvent('filechooser');
    await page.getByText('Import settings...', { exact: true }).click();
    await (
      await newer
    ).setFiles({
      name: 'ega-settings-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ version: 3, settings: { theme }, customLanguages: [] })),
    });
    await expect(
      page.getByText('This backup is from a newer Ega. Update Ega, then import it.'),
    ).toBeVisible();
    await centerOn(page, '[data-ega-setting="advanced.dataBackup"]');
    await optShot(page, 'data-import-too-new', theme, {
      userAction: 'user picked a backup made by a newer Ega',
      expectations: [
        'the status line says to update Ega first, in the error tone; nothing changed',
      ],
    });
    // A backup that carries API keys asks whether to keep them, after "Import settings?".
    const withKeys = page.waitForEvent('filechooser');
    await page.getByText('Import settings...', { exact: true }).click();
    await (
      await withKeys
    ).setFiles({
      name: 'ega-settings-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          settings: { ...OPTIONS_CONFIGURED, theme, anthropicApiKey: 'sk-ant-from-file' },
          customLanguages: [],
        }),
      ),
    });
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByRole('dialog', { name: 'Keep API keys from file?' }).waitFor();
    await optShot(page, 'data-import-keep-keys', theme, {
      userAction: 'user confirmed the import of a backup that holds API keys',
      expectations: [
        '"Keep API keys from file?" with Keep keys and Strip keys; Strip keys is focused',
      ],
      overlay: true,
    });
    await page.getByRole('button', { name: 'Strip keys' }).click();
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'advanced',
      sub: 'data',
      seed: { sitePrefs: manySites },
      storage: conversations(6, Date.now()),
    });
    await page.locator('[data-ega-per-site-card]').scrollIntoViewIfNeeded();
    await optShot(page, 'data-site-overrides-many', theme, {
      userAction: 'user has thirteen site overrides, one with a host too long for its row',
      expectations: ['the Filter sites box shows; each row: site, state in words, trash'],
    });
    await page.locator('[data-ega-setting="advanced.savedConversations"]').scrollIntoViewIfNeeded();
    await optShot(page, 'data-conversations-many', theme, {
      userAction: 'user has six saved conversations',
      expectations: [
        'each row: the first message (or Image), then site, message count, last used and size; an older row shows its site; Delete all in the header',
      ],
    });
    await page.locator('[data-ega-site-override-clear-all]').click();
    await page.locator('[data-sonner-toast]').first().waitFor();
    await optShot(page, 'data-remove-all-toast', theme, {
      userAction: 'user pressed Remove all',
      expectations: ['"Removed 13 site overrides" with Undo; the card shows its empty state'],
    });
    await page.close();

    const perf = `(() => { const s = chrome.runtime.sendMessage.bind(chrome.runtime);
      const entries = [120, 180, 240, 300, 410, 520, 760, 980, 1400, 2600].map((latencyMs, i) =>
        ({ backendId: 'anthropic', cacheHit: false, latencyMs, ts: Date.now() - i * 1000 }));
      entries.push({ backendId: 'gemini', cacheHit: false, latencyMs: 2300, ts: Date.now(), error: 'AUTH' });
      chrome.runtime.sendMessage = (m, ...r) => m && m.kind === 'perf:entries' ? Promise.resolve({ entries }) : s(m, ...r); })();`;
    page = await openOptionsState(theme, { tab: 'advanced', sub: 'diagnostics' });
    await optShot(page, 'diagnostics-empty', theme, {
      userAction: 'user opened Diagnostics before any request',
      expectations: [
        '"No requests yet" once; "Translate something to see response times"; "No errors in the last hour" with the check icon',
      ],
    });
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'advanced',
      sub: 'diagnostics',
      init: perf,
      storage: { egaAuditLog: { version: 1, entries: SAMPLE_AUDIT(Date.now()) } },
    });
    await expect(page.locator('[data-ega-perf-copy]')).toBeVisible();
    await optShot(page, 'diagnostics-populated', theme, {
      userAction: 'user opened Diagnostics after a few requests',
      expectations: [
        'rows in words: task, backend name, time, status, when, Details; Export and Clear in the header',
        'labelled response-time stats; the chart with three axis labels',
      ],
    });
    await centerOn(page, '[data-ega-recent-error]');
    await optShot(page, 'diagnostics-errors-populated', theme, {
      userAction: 'user scrolled to Recent errors',
      expectations: [
        'plain titles with backend, count and last time; the sentence of what to do; Details',
      ],
    });
    await page.locator('[data-ega-audit-entry="au-2"] [data-ega-audit-entry-toggle]').click();
    await centerOn(page, '[data-ega-audit-entry="au-2"]');
    await optShot(page, 'diagnostics-row-details', theme, {
      userAction: 'user opened Details on the failed Explain request',
      expectations: [
        'model, languages, tokens, the raw code under Technical, the prompt panels, then Compare',
      ],
    });
    await page.locator('[data-ega-audit-filter-task]').selectOption('grammar');
    await centerOn(page, '[data-ega-audit-filters]');
    await optShot(page, 'diagnostics-filters-no-results', theme, {
      userAction: 'user filtered for a task with no requests',
      expectations: ['"No request matches these filters" with a ghost Clear filters'],
    });
    await page.close();

    page = await openOptionsState(theme, {
      tab: 'advanced',
      sub: 'diagnostics',
      init: perf,
      seed: { captureResultMeta: false },
    });
    await centerOn(page, '[data-ega-perf-off]');
    await optShot(page, 'diagnostics-recording-off', theme, {
      userAction: 'user turned Record request details off',
      expectations: [
        'Response times says "Response times are off. Turn on Record request details below."; no Copy data',
      ],
    });
    await page.close();

    page = await openOptionsState(theme, { tab: 'about' });
    await optShot(page, 'about', theme, {
      fullPage: true,
      userAction: 'user opened About',
      expectations: [
        'Privacy in three columns with no inner borders; Credits and links as label-value rows',
      ],
    });
    await page.close();
  }
});
