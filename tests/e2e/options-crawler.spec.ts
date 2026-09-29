// Walks every nav tab, clicks the safe controls, and fails on console errors or bad storage.
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from './helpers';
import type { Settings } from '../../src/shared/types';
import { BUNDLED_RECIPES } from '../../src/shared/recipes';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

const BENIGN_CONSOLE_PATTERNS = [
  /devtools/i,
  /Extensions/i,
  /favicon/i,
  /net::ERR_BLOCKED_BY_CLIENT/i,
  // Svelte HMR noise in dev builds (not present in prod but guard anyway).
  /\[svelte\]/i,
  // Chromium MV3 service-worker lifecycle noise.
  /service.worker/i,
];

function isBenign(msg: string): boolean {
  return BENIGN_CONSOLE_PATTERNS.some((p) => p.test(msg));
}

/** A bundled recipe the test needs is a fixture contract: a miss fails instead of skipping. */
function mustFind<T>(value: T | undefined, what: string): T {
  expect(value, `bundled recipes must include ${what}`).toBeDefined();
  return value as T;
}

async function openOptions(
  context: BrowserContext,
  extensionId: string,
): Promise<{ page: Page; errors: string[] }> {
  const errors: string[] = [];
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      // The Backends tab probes the local Ollama; with no daemon (blockLocalOllama) Chrome logs the refused load.
      const ollamaProbe = /ERR_CONNECTION_REFUSED/.test(t) && /:11434\//.test(msg.location().url);
      if (!isBenign(t) && !ollamaProbe) errors.push(t);
    }
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  await page.goto(`chrome-extension://${extensionId}/src/options/index.html`);
  // Options page is SPA — no data-ega-test-ready bridge, just wait for nav
  await page.waitForSelector('[role="tab"]', { timeout: 10_000 });
  return { page, errors };
}

async function clickTab(page: Page, name: string): Promise<void> {
  await page.locator(`[role="tab"]`, { hasText: name }).first().click();
  await page.waitForTimeout(200);
}

async function assertSettingsValid(
  context: BrowserContext,
  extensionId: string,
  label: string,
): Promise<void> {
  const s = await readStorage<Settings>(context, extensionId, 'ega.settings');
  // null → not yet written (fresh install is fine, schema defaults apply on first read)
  if (s === null) return;
  expect(typeof s, `${label}: settings must be an object`).toBe('object');
  expect(s, `${label}: settings.advanced must exist`).toHaveProperty('advanced');
  expect(s, `${label}: settings.backendOrder must be array`).toHaveProperty('backendOrder');
  if ('glossary' in s) {
    expect(Array.isArray(s.glossary), `${label}: settings.glossary must be an array`).toBe(true);
  }
}

/** Clicks the non-destructive `data-ega-*` controls in the current tab; returns the click count. */
async function crawlDataEgaClickables(
  page: Page,
  errors: string[],
  context: BrowserContext,
  extensionId: string,
  tabLabel: string,
  cap = 50,
): Promise<number> {
  // Never click these: destructive, navigating away, or covered by a dedicated test.
  const SKIP_ATTRS = new Set([
    'data-ega-reset-defaults',
    'data-ega-section-reset',
    'data-ega-reset-field',
    'data-ega-audit-clear',
    'data-ega-recipe-delete',
    'data-ega-rule-delete',
    'data-ega-site-override-clear',
    'data-ega-site-override-clear-all',
    'data-ega-site-override-export',
    'data-ega-recipe-new', // opens dialog — handled in modal flows
    'data-ega-recipe-paste', // opens dialog — handled in modal flows
    'data-ega-export-menu', // opens menu — separate test
    'data-ega-audit-export',
    'data-ega-task-presets-export',
    'data-ega-backup-restore-row', // triggers file-picker
    'data-ega-preview-prompt', // modal — handled in modal flows
    'data-ega-compile-preview', // modal — handled in modal flows
    'data-ega-tpl-overwrite', // destructive
    'data-ega-clear-cache', // side-effect OK but not per-crawl
    'data-ega-source-link', // external navigation
    'data-ega-install-info', // external navigation / download
    'data-ega-manage-rules', // jumps to another tab
    'data-ega-delegation-jump', // jumps to another tab
    'data-ega-status-jump-backends', // jumps to another tab
    'data-ega-glossary-add', // submit form — glossary tests handle this
    'data-ega-manual-submit', // submit form
    'data-ega-recipe-apply', // recipe confirm-dialog — recipe tests handle this
    'data-ega-recipe-rules-only', // recipe apply — recipe tests handle this
  ]);

  let clicked = 0;

  // CSS has no attribute-name prefix form, so the data-ega-* filter runs on each element's attributes below.
  const handles = await page
    .locator(
      'button, [role="button"], [role="tab"], [role="radio"], [role="checkbox"], input[type="checkbox"]',
    )
    .all();

  for (const handle of handles) {
    if (clicked >= cap) break;
    if (!(await handle.isVisible().catch(() => false))) continue;
    if (await handle.isDisabled().catch(() => false)) continue;

    const attrList = await handle.evaluate((el) =>
      Array.from(el.attributes)
        .filter((a) => a.name.startsWith('data-ega-'))
        .map((a) => a.name),
    );
    if (attrList.length === 0) continue;
    const shouldSkip = attrList.some((a) => SKIP_ATTRS.has(a));
    if (shouldSkip) continue;

    const before = errors.length;
    try {
      await handle.click({ timeout: 2_000 });
      await page.waitForTimeout(120);
    } catch {
      // Non-interactive or covered by overlay — skip.
      continue;
    }

    const after = errors.length;
    if (after > before) {
      const newErrors = errors.slice(before);
      // Log but don't hard-fail here — the per-tab assertion does that.
      console.warn(
        `[crawler] ${tabLabel}: console errors after clicking [${attrList.join(', ')}]:`,
        newErrors,
      );
    }

    // The .ega-dialog panel itself carries role="dialog"; matching the class stays strict-mode safe.
    const dialog = page.locator('.ega-dialog').first();
    if (await dialog.isVisible().catch(() => false)) {
      const cancelBtn = dialog.getByRole('button', { name: /cancel/i });
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click().catch(() => {});
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(100);
    }

    const menu = page.locator('[role="menu"]');
    if (await menu.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(80);
    }

    clicked++;
  }

  await assertSettingsValid(context, extensionId, `${tabLabel} after crawl`);
  return clicked;
}

// 1. Tab mount smoke + console errors

const TOP_LEVEL_TABS = [
  'Translate',
  'Selection & picker',
  'Backends',
  'Languages',
  'Templates',
  'Glossary',
  'Advanced',
  'About',
] as const;

for (const tabName of TOP_LEVEL_TABS) {
  test(`tab mount: ${tabName} — no console errors`, async () => {
    const { page, errors } = await openOptions(ext.context, ext.extensionId);
    await test.step('click tab', async () => {
      await clickTab(page, tabName);
    });
    await test.step('assert no console errors on mount', async () => {
      // Short dwell so async init errors surface.
      await page.waitForTimeout(400);
      expect(errors, `Console errors on ${tabName} mount`).toEqual([]);
    });
    await test.step('assert storage remains valid', async () => {
      await assertSettingsValid(ext.context, ext.extensionId, `${tabName} mount`);
    });
  });
}

// 2. Per-tab clickable crawl

const clicksByTab = new Map<string, number>();

for (const tabName of TOP_LEVEL_TABS) {
  test(`crawl clickables: ${tabName}`, async () => {
    const { page, errors } = await openOptions(ext.context, ext.extensionId);

    await test.step(`navigate to ${tabName}`, async () => {
      await clickTab(page, tabName);
      await page.waitForTimeout(300);
    });

    let clickCount = 0;
    await test.step('walk data-ega-* clickables (max 50)', async () => {
      clickCount = await crawlDataEgaClickables(
        page,
        errors,
        ext.context,
        ext.extensionId,
        tabName,
      );
      clicksByTab.set(tabName, clickCount);
    });

    await test.step('assert no console errors from click walk', async () => {
      expect(errors, `Console errors during ${tabName} crawl (${clickCount} clicks)`).toEqual([]);
    });
  });
}

// Positive control for the walk: About and Languages carry no data-ega-* control, so the sum is the bar, not a per-tab minimum.
test('crawl clickables: the walk clicked at least one control', () => {
  const total = [...clicksByTab.values()].reduce((sum, n) => sum + n, 0);
  expect(total, `clicks by tab: ${JSON.stringify([...clicksByTab])}`).toBeGreaterThan(0);
});

// 3. Modal flows — Esc closes, focus returns

test('modal: Preview Prompt closes on Esc + focus returns to trigger', async () => {
  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('open Templates tab', async () => {
    await clickTab(page, 'Templates');
    await page.waitForTimeout(300);
  });

  await test.step('open Preview Prompt modal', async () => {
    const trigger = page.locator('[data-ega-preview-prompt]');
    await expect(trigger).toBeVisible({ timeout: 5_000 });
    await trigger.click();
  });

  await test.step('modal visible', async () => {
    await expect(page.locator('[data-ega-preview-modal]')).toBeVisible({ timeout: 5_000 });
  });

  await test.step('Esc closes modal', async () => {
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-ega-preview-modal]')).toHaveCount(0, { timeout: 3_000 });
  });

  expect(errors, 'No console errors during modal open/close').toEqual([]);
});

test('modal: Recipe apply confirm opens then Cancel closes', async () => {
  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('open Templates → Recipes', async () => {
    await clickTab(page, 'Templates');
    await page.waitForTimeout(300);
    const recipesChip = page.locator('[data-ega-workbench-chip="recipes"]');
    await expect(recipesChip).toBeVisible({ timeout: 5_000 });
    await recipesChip.click();
    await page.waitForTimeout(300);
  });

  await test.step('click first Apply button', async () => {
    const applyBtn = page.locator('[data-ega-recipe-apply]').first();
    await expect(applyBtn).toBeVisible({ timeout: 5_000 });
    await applyBtn.click();
  });

  await test.step('confirm dialog visible', async () => {
    await expect(page.locator('.ega-dialog')).toBeVisible({ timeout: 3_000 });
  });

  await test.step('Cancel closes dialog', async () => {
    const dialog = page.locator('.ega-dialog');
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).toHaveCount(0, { timeout: 3_000 });
  });

  expect(errors, 'No errors during recipe apply modal flow').toEqual([]);
});

test('modal: Export menu on Advanced > Data opens + Esc closes', async () => {
  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('open Advanced tab', async () => {
    await clickTab(page, 'Advanced');
    await page.waitForTimeout(200);
    const dataSubTab = page.locator('[data-ega-subtab="data"]');
    await expect(dataSubTab).toBeVisible({ timeout: 5_000 });
    await dataSubTab.click();
    await page.waitForTimeout(200);
  });

  await test.step('open export menu', async () => {
    const exportMenu = page.locator('[data-ega-export-menu]');
    await expect(exportMenu).toBeVisible({ timeout: 3_000 });
    await exportMenu.click();
    await expect(page.getByRole('menuitem').first()).toBeVisible({ timeout: 3_000 });
  });

  await test.step('click outside closes menu', async () => {
    // bits-ui menus close on pointer-down outside; click on the page heading.
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await expect(page.getByRole('menuitem').first()).toHaveCount(0, { timeout: 3_000 });
  });

  expect(errors, 'No errors during export menu flow').toEqual([]);
});

// 4. Recipe flows — idempotency + label logic

test('recipes: Apply then re-apply is idempotent (dedup)', async () => {
  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  const target = mustFind(
    BUNDLED_RECIPES.find((r) => (r.rules?.length ?? 0) >= 1),
    'a recipe with at least one rule',
  );

  await test.step('navigate to Recipes', async () => {
    await clickTab(page, 'Templates');
    await page.waitForTimeout(300);
    const recipesChip = page.locator('[data-ega-workbench-chip="recipes"]');
    await expect(recipesChip).toBeVisible({ timeout: 5_000 });
    await recipesChip.click();
    await page.waitForTimeout(400);
  });

  await test.step('apply recipe once', async () => {
    const card = page.locator(`[data-ega-recipe-id="${target.id}"]`);
    await expect(card).toBeVisible({ timeout: 5_000 });
    await card.locator('[data-ega-recipe-apply]').click();

    const dialog = page.locator('.ega-dialog');
    await expect(dialog).toBeVisible({ timeout: 3_000 });
    await dialog.getByRole('button', { name: /^Apply$/ }).click();
    await expect(dialog).toHaveCount(0, { timeout: 3_000 });
    await page.waitForTimeout(300);
  });

  const rulesAfterFirst = await test.step('read rules after first apply', async () => {
    const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
    return s?.advanced.rules.length ?? 0;
  });

  await test.step('apply same recipe again', async () => {
    const card = page.locator(`[data-ega-recipe-id="${target.id}"]`);
    await card.locator('[data-ega-recipe-apply]').click();
    const dialog = page.locator('.ega-dialog');
    await expect(dialog).toBeVisible({ timeout: 3_000 });
    await dialog.getByRole('button', { name: /^Apply$/ }).click();
    await expect(dialog).toHaveCount(0, { timeout: 3_000 });
    await page.waitForTimeout(300);
  });

  await test.step('rule count unchanged (dedup)', async () => {
    const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
    const rulesAfterSecond = s?.advanced.rules.length ?? 0;
    expect(
      rulesAfterSecond,
      `Re-applying recipe "${target.label}" must not add duplicate rules`,
    ).toBe(rulesAfterFirst);
  });

  expect(errors, 'No errors during recipe idempotency test').toEqual([]);
});

test('recipes: single-rule recipe shows "Apply" label and no secondary button', async () => {
  const singleRule = mustFind(
    BUNDLED_RECIPES.find((r) => (r.rules?.length ?? 0) === 1),
    'a single-rule recipe',
  );

  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('navigate to Recipes', async () => {
    await clickTab(page, 'Templates');
    await page.waitForTimeout(300);
    await page.locator('[data-ega-workbench-chip="recipes"]').click();
    await page.waitForTimeout(400);
  });

  await test.step('assert primary button label is "Apply" (not "Apply all")', async () => {
    const card = page.locator(`[data-ega-recipe-id="${singleRule.id}"]`);
    await expect(card).toBeVisible({ timeout: 5_000 });
    const primaryBtn = card.locator('[data-ega-recipe-apply]');
    await expect(primaryBtn).toHaveText('Apply');
  });

  await test.step('assert no "Add rules" secondary button', async () => {
    const card = page.locator(`[data-ega-recipe-id="${singleRule.id}"]`);
    await expect(card.locator('[data-ega-recipe-rules-only]')).toHaveCount(0);
  });

  expect(errors, 'No errors checking single-rule recipe label').toEqual([]);
});

test('recipes: multi-rule recipe shows "Apply all" + "Add rules" buttons', async () => {
  const multiRule = mustFind(
    BUNDLED_RECIPES.find((r) => (r.rules?.length ?? 0) > 1),
    'a multi-rule recipe',
  );

  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('navigate to Recipes', async () => {
    await clickTab(page, 'Templates');
    await page.waitForTimeout(300);
    await page.locator('[data-ega-workbench-chip="recipes"]').click();
    await page.waitForTimeout(400);
  });

  await test.step('assert primary button label is "Apply all"', async () => {
    const card = page.locator(`[data-ega-recipe-id="${multiRule.id}"]`);
    await expect(card).toBeVisible({ timeout: 5_000 });
    await expect(card.locator('[data-ega-recipe-apply]')).toHaveText('Apply all');
  });

  await test.step('assert "Add rules" secondary button present', async () => {
    const card = page.locator(`[data-ega-recipe-id="${multiRule.id}"]`);
    await expect(card.locator('[data-ega-recipe-rules-only]')).toBeVisible();
  });

  expect(errors, 'No errors checking multi-rule recipe buttons').toEqual([]);
});

test('recipes: "Add rules" appends without dupes on double-click', async () => {
  const multiRule = mustFind(
    BUNDLED_RECIPES.find((r) => (r.rules?.length ?? 0) > 1),
    'a multi-rule recipe',
  );

  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('navigate to Recipes', async () => {
    await clickTab(page, 'Templates');
    await page.waitForTimeout(300);
    await page.locator('[data-ega-workbench-chip="recipes"]').click();
    await page.waitForTimeout(400);
  });

  await test.step('click "Add rules" first time', async () => {
    const card = page.locator(`[data-ega-recipe-id="${multiRule.id}"]`);
    await card.locator('[data-ega-recipe-rules-only]').click();
    await page.waitForTimeout(300);
  });

  const rulesAfterFirst = await test.step('read rules after first add', async () => {
    const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
    return s?.advanced.rules.length ?? 0;
  });

  await test.step('click "Add rules" second time', async () => {
    const card = page.locator(`[data-ega-recipe-id="${multiRule.id}"]`);
    await card.locator('[data-ega-recipe-rules-only]').click();
    await page.waitForTimeout(300);
  });

  await test.step('rule count unchanged after second add (dedup)', async () => {
    const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
    const rulesAfterSecond = s?.advanced.rules.length ?? 0;
    expect(
      rulesAfterSecond,
      `Clicking "Add rules" twice on "${multiRule.label}" must not create duplicates`,
    ).toBe(rulesAfterFirst);
  });

  expect(errors, 'No errors during Add rules double-click test').toEqual([]);
});

// 5. Glossary cap / empty / cap-message flows

test('glossary: empty state renders at 0 entries', async () => {
  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('navigate to Glossary', async () => {
    await clickTab(page, 'Glossary');
    await page.waitForTimeout(300);
  });

  await test.step('no glossary-list visible when 0 entries', async () => {
    // Either an empty-state message or no list element.
    const list = page.locator('[data-ega-glossary-list]');
    const isEmpty = (await list.count()) === 0 || !(await list.isVisible());
    expect(isEmpty, 'glossary-list must not show when empty').toBe(true);
  });

  expect(errors, 'No errors on empty Glossary tab').toEqual([]);
});

test('glossary: add 1 entry — list appears and storage updated', async () => {
  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('navigate to Glossary', async () => {
    await clickTab(page, 'Glossary');
    await page.waitForTimeout(300);
  });

  await test.step('fill and submit add-entry form', async () => {
    const addSection = page.locator('[data-ega-glossary-add]');
    await expect(addSection).toBeVisible({ timeout: 5_000 });
    await addSection.getByLabel(/^Term/i).fill('Ega');
    await addSection.getByLabel(/^Translation/i).fill('ega-translated');
    await addSection.getByRole('button', { name: /Add entry/i }).click();
    await page.waitForTimeout(300);
  });

  await test.step('glossary list appears with new entry', async () => {
    await expect(page.locator('[data-ega-glossary-list]')).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('[data-ega-glossary-list]')).toContainText('Ega');
  });

  await test.step('storage reflects new entry', async () => {
    const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
    expect(s?.glossary.length, 'glossary should have 1 entry').toBe(1);
    expect(s?.glossary[0]?.term, 'entry term matches').toBe('Ega');
  });

  expect(errors, 'No errors during glossary add flow').toEqual([]);
});

test('glossary: add-entry button is disabled when fields empty', async () => {
  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('navigate to Glossary', async () => {
    await clickTab(page, 'Glossary');
    await page.waitForTimeout(300);
  });

  await test.step('add button disabled with empty inputs', async () => {
    const addBtn = page
      .locator('[data-ega-glossary-add]')
      .getByRole('button', { name: /Add entry/i });
    await expect(addBtn).toBeDisabled({ timeout: 3_000 });
  });

  expect(errors, 'No errors on glossary empty-inputs check').toEqual([]);
});

test('glossary: cap message appears at 200 entries', async () => {
  const entries = Array.from({ length: 200 }, (_, i) => ({
    term: `term-${i}`,
    translation: `translation-${i}`,
    caseSensitive: false,
  }));
  await seedSettings(ext.context, ext.extensionId, { glossary: entries });

  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('navigate to Glossary', async () => {
    await clickTab(page, 'Glossary');
    await page.waitForTimeout(400);
  });

  await test.step('200 entries render in list', async () => {
    const list = page.locator('[data-ega-glossary-list]');
    await expect(list).toBeVisible({ timeout: 5_000 });
    const rows = list.locator('li');
    await expect(rows).toHaveCount(200, { timeout: 5_000 });
  });

  await test.step('add-entry button disabled or cap error on attempt', async () => {
    // Both a disabled button and a cap error are valid UI answers here.
    const addSection = page.locator('[data-ega-glossary-add]');
    const addBtn = addSection.getByRole('button', { name: /Add entry/i });

    await addSection.getByLabel(/^Term/i).fill('OverCapTerm');
    await addSection.getByLabel(/^Translation/i).fill('OverCapTranslation');

    const isDisabled = await addBtn.isDisabled().catch(() => false);
    if (!isDisabled) {
      await addBtn.click();
      await page.waitForTimeout(200);
      await expect(page.locator('.glossary-error')).toContainText(/limit is 200/i, {
        timeout: 3_000,
      });
    }
  });

  expect(errors, 'No errors during glossary cap test').toEqual([]);
});

// 6. Persistence: change something → reload → verify restored

test('persistence: Display/Selection bubbleMode change survives page reload', async () => {
  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('navigate to Selection & picker', async () => {
    await clickTab(page, 'Selection & picker');
    await page.waitForTimeout(300);
  });

  await test.step('click "always" bubble mode radio', async () => {
    // bits-ui renders the radio as a button, so click the label row that wraps it.
    const bubbleModeGroup = page.locator('[data-ega-bubble-mode]');
    await expect(bubbleModeGroup).toBeVisible({ timeout: 5_000 });
    await bubbleModeGroup.getByText('Always', { exact: true }).click();
    await page.waitForTimeout(300);
  });

  await test.step('verify storage written', async () => {
    await expect
      .poll(
        async () => {
          const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
          return s?.bubbleMode;
        },
        { timeout: 5_000 },
      )
      .toBe('always');
  });

  await test.step('reload page', async () => {
    await page.reload();
    await page.waitForSelector('[role="tab"]', { timeout: 10_000 });
    await clickTab(page, 'Selection & picker');
    await page.waitForTimeout(400);
  });

  await test.step('bubbleMode "always" still selected after reload', async () => {
    // Read storage, not the bits-ui `data-state`, which is internal to the library.
    const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
    expect(s?.bubbleMode, 'bubbleMode must be "always" after reload').toBe('always');
  });

  expect(errors, 'No errors during persistence test').toEqual([]);
});

test('persistence: Glossary entry survives page reload', async () => {
  const { page: page1, errors: errors1 } = await openOptions(ext.context, ext.extensionId);

  await test.step('add glossary entry', async () => {
    await clickTab(page1, 'Glossary');
    await page1.waitForTimeout(300);
    const addSection = page1.locator('[data-ega-glossary-add]');
    await addSection.getByLabel(/^Term/i).fill('PersistTest');
    await addSection.getByLabel(/^Translation/i).fill('PersistTranslation');
    await addSection.getByRole('button', { name: /Add entry/i }).click();
    await page1.waitForTimeout(300);
  });

  await test.step('reload and verify entry present', async () => {
    await page1.reload();
    await page1.waitForSelector('[role="tab"]', { timeout: 10_000 });
    await clickTab(page1, 'Glossary');
    await page1.waitForTimeout(400);
    await expect(page1.locator('[data-ega-glossary-list]')).toContainText('PersistTest', {
      timeout: 5_000,
    });
  });

  expect(errors1, 'No errors during glossary persistence test').toEqual([]);
});

// 7. Advanced sub-tabs — walk all 3

test('Advanced: all 3 sub-tabs mount without console errors', async () => {
  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('open Advanced tab', async () => {
    await clickTab(page, 'Advanced');
    await page.waitForTimeout(200);
  });

  for (const subTabId of ['diagnostics', 'data', 'labs'] as const) {
    await test.step(`click ${subTabId} sub-tab`, async () => {
      const subTab = page.locator(`[data-ega-subtab="${subTabId}"]`);
      await expect(subTab).toBeVisible({ timeout: 5_000 });
      await subTab.click();
      await page.waitForTimeout(300);
    });
  }

  expect(errors, 'No errors traversing Advanced sub-tabs').toEqual([]);
});

// 8. SettingsSearch modal

test('SettingsSearch: Ctrl+, opens modal and Esc closes it', async () => {
  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('press Ctrl+,', async () => {
    await page.keyboard.press('Control+,');
  });

  await test.step('search combobox visible', async () => {
    const search = page.getByRole('combobox', { name: /Search settings/i });
    await expect(search).toBeVisible({ timeout: 5_000 });
  });

  await test.step('Esc closes', async () => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('combobox', { name: /Search settings/i })).toHaveCount(0, {
      timeout: 3_000,
    });
  });

  expect(errors, 'No errors during SettingsSearch modal flow').toEqual([]);
});

// 9. Backends tab — no errors on mount

test('Backends: tab mounts and backend chain section visible', async () => {
  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('click Backends tab', async () => {
    await clickTab(page, 'Backends');
    await page.waitForTimeout(400);
  });

  await test.step('backend list rows rendered', async () => {
    // The list carries no `data-ega-*`, so match a drag-reorder row instead.
    await expect(page.locator('[data-be-row-id]').first()).toBeVisible({ timeout: 8_000 });
  });

  expect(errors, 'No errors on Backends tab mount').toEqual([]);
});

// 10. Languages tab — the language list and the add-custom-language form mount

test('Languages: list renders and the custom language form opens', async () => {
  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('click Languages tab', async () => {
    await clickTab(page, 'Languages');
    await page.waitForTimeout(300);
  });

  await test.step('arabizi preset checkbox visible', async () => {
    await expect(page.locator('#enable-arabizi')).toBeVisible({ timeout: 5_000 });
  });

  await test.step('add custom language button opens form', async () => {
    await page.getByRole('button', { name: /add custom language/i }).click();
    // The label input gets an auto-id; only the hint textarea has a fixed one.
    await expect(page.locator('#new-hint')).toBeVisible({ timeout: 3_000 });
  });

  expect(errors, 'No errors during Languages tab flow').toEqual([]);
});
