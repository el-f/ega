import { test, expect, type Page } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  onlyBackends,
  openLanguagePrompt,
  seedSettings,
  selectArabiziParagraph,
  sendImageTranslatePending,
  sendImageTranslateResult,
  waitForTestHooks,
  type ExtensionHandle,
  pickAreasAndTranslate,
  resetRoutes,
  seedCustomTasks,
  customTask,
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
  opts: { skipPark?: boolean } = {},
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
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(50); // wait for fixed overlays to repaint at y=0 (no observable end state)
  const currentFile = path.join(CURRENT_DIR, `${name}.png`);
  await page.screenshot({ path: currentFile, fullPage: true });
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
    userAction: 'user opened Options shell and clicked Advanced in the left nav rail',
    expectations: [
      'Advanced tab is selected in the left nav rail',
      'Advanced sub-tab strip (Diagnostics / Data / Labs) is rendered with Diagnostics active',
      'left nav rail is visible',
    ],
  });

  const subTab = (id: string): ReturnType<Page['locator']> =>
    page.locator(`[data-ega-subtab="${id}"]`).first();

  // Each task's prompt and switches open in its edit dialog on the Tasks tab.
  await page.locator('[role="tab"]:has-text("Tasks")').first().click();
  await page.waitForTimeout(400); // wait for tab panel CSS transition (no observable end state)
  for (const id of [
    'translate',
    'explain',
    'summarize',
    'reword',
    'grammar',
    'suggest-replies',
    'ask',
  ]) {
    await page.locator(`[data-ega-task-edit="${id}"]`).click();
    await page.locator(`[data-ega-task-dialog="${id}"]`).waitFor({ timeout: 5_000 });
    await page.waitForTimeout(300); // wait for dialog mount animation (no observable end state)
    await shot(page, `templates-${id}`, {
      surface: 'templates',
      state: `task-dialog-${id}`,
      theme: 'light',
      userAction: `user opened the ${id} task's edit dialog on the Tasks tab`,
      expectations: [
        `${id} dialog shows its switches and its prompt editor, or the line naming the prompt it uses`,
        'no native primitives leaked into the dialog frame',
      ],
    });
    await page.keyboard.press('Escape');
    await page.locator('[data-ega-task-dialog]').waitFor({ state: 'detached', timeout: 5_000 });
  }

  // Sub-tabs are back on Advanced.
  await page.locator('[role="tab"]:has-text("Advanced")').first().click();
  await page.waitForTimeout(400); // wait for tab panel CSS transition (no observable end state)

  for (const id of ['diagnostics', 'data', 'labs']) {
    await subTab(id).click();
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

  // Slot palette + raw template visible (the Translate prompt)
  await page.locator('[role="tab"]:has-text("Tasks")').first().click();
  await page.locator('[data-ega-task-edit="translate"]').click();
  await page.locator('[data-ega-task-dialog="translate"]').waitFor({ timeout: 5_000 });
  await page.waitForTimeout(300); // wait for dialog mount animation (no observable end state)
  await shot(page, 'templates-global-detail', {
    surface: 'templates',
    state: 'global-detail',
    theme: 'light',
    userAction: 'user opened the Translate task dialog and saw the slot palette + raw template',
    expectations: ['slot palette visible', 'editor visible below', 'no overflow'],
  });

  // bits-ui opens the tooltip on a real pointermove; synthetic enter events do not open it.
  const slotChip = page.locator('[data-ega-slot-chip]').first();
  await slotChip.scrollIntoViewIfNeeded();
  await slotChip.hover();
  await page.locator('.ega-tooltip-content').first().waitFor({ timeout: 3_000 });
  await page.waitForTimeout(250); // wait for tooltip fade-in animation to complete (no observable end state)
  // No cursor park: moving off the pill would close the tooltip this shot is for.
  await shot(
    page,
    'templates-global-slot-hover',
    {
      surface: 'templates',
      state: 'global-slot-hover',
      theme: 'light',
      userAction: 'user hovered a slot pill in the palette to read its registry description',
      expectations: [
        'registry tooltip near the hovered slot pill',
        'tooltip text legible',
        'tooltip does NOT clip surrounding pills illegibly',
      ],
    },
    { skipPark: true },
  );
  await page.mouse.move(0, 0);
  await page.locator('.ega-tooltip-content').first().waitFor({ state: 'detached', timeout: 3_000 });

  // Click the [+ Insert variable] command picker
  await page.locator('[data-ega-slot-insert-picker]').click();
  await page.getByPlaceholder('Search variables…').waitFor({ state: 'visible', timeout: 5_000 });
  await page.waitForTimeout(200); // wait for popover position recompute (no observable end state)
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
  await page.getByPlaceholder('Search variables…').waitFor({ state: 'hidden', timeout: 5_000 });

  // Rules section on the Tasks tab — empty
  await page.keyboard.press('Escape');
  await page.locator('[data-ega-task-dialog]').waitFor({ state: 'detached', timeout: 5_000 });
  await page.locator('[data-ega-setting="tasks.rules"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300); // wait for scroll to settle (no observable end state)
  await shot(page, 'templates-rules-empty', {
    surface: 'templates',
    state: 'rules-empty',
    theme: 'light',
    userAction: 'user scrolled to the Rules section of the Tasks tab with no rules defined',
    expectations: [
      'empty state visible with an Add a rule button',
      'no rule form shown until Add a rule is pressed',
      'no bare empty pane',
    ],
  });

  // No assertion: the PNGs above are the output, and `pnpm visual:judge` reads them.
});

test('Options — all top-level tabs (light + dark sampling)', async () => {
  test.slow();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');

  // Advanced has its own landing shots above.
  const tabs = SETTINGS_TABS.map((t) => t.id).filter((id) => id !== 'advanced');
  for (const id of tabs) {
    await page.locator(`#tab-${id}`).click();
    await page.waitForTimeout(400); // wait for tab panel mount animation (no observable end state)
    await shot(page, `options-${id}`, {
      surface: 'options',
      state: id,
      theme: 'light',
      userAction: `user opened the ${id} options tab`,
      expectations: ['tab content mounts', 'left nav rail visible', 'no overflow'],
    });
  }

  for (const id of tabs) {
    await page.locator(`#tab-${id}`).click();
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
      await applyThemeOnPage(page, theme);
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
    await applyThemeOnPage(page, 'light');
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
    'user opened Selection & picker and scrolled to the Right-click menu card',
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
  await expect(card.locator('[data-ega-cm-full]')).toHaveCount(2);
  await expect(card.locator('[data-ega-cm-add]')).toHaveAttribute('aria-disabled', 'true');
  await cardShot('full', 'full', 'user has 50 items, the most the menu holds', [
    'under Selected text and under Images the Add button is dimmed, and "Menu is full (50 items). Delete one to add another." shows under it',
    ...ROW_RULES,
  ]);

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
  await shot(page, 'right-click-menu-delete-toast', {
    surface: 'options',
    state: 'right-click-menu-delete-toast',
    theme: 'light',
    userAction: 'user deleted the Summarize action they had added',
    expectations: ['toast "Removed "Summarize"." with Undo', 'the row is gone from Selected text'],
  });

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

  // Inspector drawer on the same tooltip.
  await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const btn = root?.querySelector<HTMLButtonElement>(
      '.tooltip button[aria-label="Show details about this reply"]',
    );
    btn?.click();
  });
  await page.waitForTimeout(400); // wait for inspector drawer slide-in animation (no observable end state)
  await shot(page, 'tooltip-inspector-open', {
    surface: 'tooltip',
    state: 'inspector-open',
    theme: 'light',
    userAction: 'user clicked Details (i) on the tooltip',
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
      return !!root?.querySelector('.tooltip [data-ega-multi-variety]');
    },
    { timeout: 10_000, polling: 250 },
  );
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

async function openTasksTab(page: Page): Promise<void> {
  await page.locator('[role="tab"]:has-text("Tasks")').first().click();
  await page.waitForTimeout(300); // wait for tab panel CSS transition (no observable end state)
}

async function showRules(page: Page): Promise<void> {
  await page.locator('[data-ega-setting="tasks.rules"]').scrollIntoViewIfNeeded();
}

test('Templating — rules editor states', async () => {
  // 3 shots + 1 reload. Comfortably under slow().
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
      rules: SEED_RULES,
      snippets: {},
      temperature: 0.2,
      maxTokens: 2048,
    },
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');
  await openTasksTab(page);

  // --- Rules editor (populated) ---
  await showRules(page);
  await page.waitForTimeout(400); // wait for chip workbench mount animation (no observable end state)
  await expect(page.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });
  await page.locator('[data-ega-rule-row]').first().waitFor({ state: 'visible', timeout: 5_000 });
  await expect(page.locator('[data-ega-rule-site-chip="twitter.com"]')).toBeVisible();
  await expect(page.locator('[data-ega-rule-task-chip="summarize"]')).toBeVisible();
  await expect(page.locator('[data-ega-rule-category]')).toHaveCount(3);
  await shot(page, 'rules-editor-populated', {
    surface: 'templates',
    state: 'rules-editor-populated',
    theme: 'light',
    userAction:
      'user opened the Rules chip with three rules seeded — host-scoped, task-scoped, and an always-rule that is off',
    expectations: [
      'three rule rows visible',
      'host chip "twitter.com ×" rendered on the first row',
      'task chip "Summarize ×" rendered on the second row',
      'third row marked off with an "Off" badge and a dashed border, text at full contrast',
      'category select column reachable on each row',
    ],
  });

  // --- Rules editor (add-form open) --- the add form sits below the rule rows.
  await page.locator('details.manual-block > summary').click();
  await page.waitForTimeout(300); // wait for <details> expand animation (no observable end state)
  await shot(page, 'rules-editor-add-form-open', {
    surface: 'templates',
    state: 'rules-editor-add-form-open',
    theme: 'light',
    userAction: 'user clicked "Add a rule" — the form details element is expanded',
    expectations: [
      'Add a rule form is expanded below the rule rows',
      'Rule text textarea visible',
      'Task chip row labeled "Applies to" with a hint that no task means all tasks',
      'Sites input labeled "Sites (optional, separated by commas)" visible',
      'Add rule primary CTA disabled while Rule text is empty, with a visible reason; Cancel beside it',
    ],
  });
  await page.locator('details.manual-block > summary').click();
  await page.waitForTimeout(200); // wait for <details> collapse animation (no observable end state)

  // Reseed with empty rules so the empty state renders.
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'You are a helpful translator.', user: '{{text}}' },
      perPresetTemplates: {},
      rules: [],
      snippets: {},
      temperature: 0.2,
      maxTokens: 2048,
    },
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await openTasksTab(page);
  await showRules(page);
  await page.waitForTimeout(400); // wait for chip workbench mount animation (no observable end state)
  await shot(page, 'rules-editor-empty', {
    surface: 'templates',
    state: 'rules-editor-empty',
    theme: 'light',
    userAction: 'user opened Rules chip with zero rules',
    expectations: ['empty-state card "No rules yet" rendered', 'no rule rows rendered'],
  });

  await resetRoutes(ext.context);
  await page.close();
});

test('Templating — per-preset + per-site', async () => {
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
  await openTasksTab(page);

  // --- Per-preset override (active) ---
  await openLanguagePrompt(page, 'arabizi', 'Arabizi');
  await page.waitForTimeout(300); // wait for editor mount animation (no observable end state)
  await shot(page, 'per-preset-override-active', {
    surface: 'templates',
    state: 'per-preset-override-active',
    theme: 'light',
    userAction:
      'user opened the Arabizi row on the Languages tab and its prompt editor; an override is already seeded so the editor mounts with the override body and a Clear action is reachable',
    expectations: [
      'the prompt editor sits inside the Arabizi row',
      'template editor mounts with the SEEDED PRESET OVERRIDE body visible',
      '"Clear" reset action visible in the editor',
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

test('Templating — slot palette insert', async () => {
  // 1 shot + 1 popover open. Light test.
  test.slow();

  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'You are a helpful translator.', user: '{{text}}' },
      perPresetTemplates: {},
      rules: [],
      snippets: {},
      temperature: 0.2,
      maxTokens: 2048,
    },
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');
  await openTasksTab(page);

  // --- Slot palette + insert-variable popover open ---
  await page.locator('[data-ega-task-edit="translate"]').click();
  await page.locator('[data-ega-task-dialog="translate"]').waitFor({ timeout: 5_000 });
  await page.locator('[data-ega-slot-insert-picker]').click();
  await page.getByPlaceholder('Search variables…').waitFor({ state: 'visible', timeout: 5_000 });
  await page.waitForTimeout(200); // wait for popover position recompute (no observable end state)
  await shot(page, 'slot-palette-insert-open', {
    surface: 'templates',
    state: 'slot-palette-insert-open',
    theme: 'light',
    userAction:
      'user opened the Translate task dialog on the Tasks tab and clicked the Insert variable picker',
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
  // The Diagnostics table lists the errors of the last hour. Write three here, in the audit log's own envelope, so this shot never depends on what earlier tests logged.
  await page.evaluate(async () => {
    const rows = [
      ['SERVER', 'Anthropic HTTP 500: upstream exploded'],
      ['ABORTED', 'The request was aborted.'],
      [
        'AUTH',
        'The backend rejected the API key. Check it in Settings → Backends.\nGemini HTTP 401',
      ],
    ];
    const entries = rows.map(([code, message], i) => ({
      id: `audit-seed-${code}`,
      ts: Date.now() - i * 1_000,
      task: 'translate',
      sourceLang: 'auto',
      targetLang: 'en',
      backend: 'anthropic',
      model: 'claude-haiku-4-5',
      systemPrompt: '',
      userPrompt: '',
      response: '',
      latencyMs: 100,
      cacheHit: false,
      error: { code, message },
    }));
    await chrome.storage.local.set({ egaAuditLog: { version: 1, entries } });
  });
  await page.reload();
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
      'left nav rail + Advanced sub-tab strip render in dark tokens',
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
      'primary "Add a Gemini key" CTA distinguishable from "Skip for now"',
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
  await successPage.locator('[data-ega-task-reset]').click();
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
      'message text "Summarize is back to the built-in settings." legible, with an Undo action',
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
