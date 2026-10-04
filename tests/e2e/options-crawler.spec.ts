// Walks every nav tab, clicks the safe controls, and fails on console errors or bad storage.
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from './helpers';
import type { Settings } from '../../src/shared/types';
import { assertStaysStable } from './flows/_harness';

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

async function openOptions(
  context: BrowserContext,
  extensionId: string,
): Promise<{ page: Page; errors: string[] }> {
  const errors: string[] = [];
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      // The Backends tab probes Ollama and the local server; blocked (blockLocalServers), Chrome logs the refused load.
      const ollamaProbe =
        /ERR_CONNECTION_REFUSED/.test(t) && /:(?:11434|1234|8080)\//.test(msg.location().url);
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

/** Waits for the panel's own heading: the tab body mounts after a lazy import. */
async function clickTab(page: Page, name: string): Promise<void> {
  await page.locator(`[role="tab"]`, { hasText: name }).first().click();
  await expect(
    page.getByRole('tabpanel').getByRole('heading', { level: 1, name, exact: true }),
  ).toBeVisible({ timeout: 5_000 });
}

/** Two frames: any DOM a click schedules (a dialog, a menu) has painted by then. */
async function nextPaint(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
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
    'data-ega-rule-delete',
    'data-ega-site-override-clear',
    'data-ega-site-override-clear-all',
    'data-ega-site-override-export',
    'data-ega-export-all', // triggers a download
    'data-ega-audit-export',
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
      await nextPaint(page);
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
      await dialog.waitFor({ state: 'hidden', timeout: 2_000 });
    }

    const menu = page.locator('[role="menu"]').first();
    if (await menu.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await menu.waitFor({ state: 'hidden', timeout: 2_000 });
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
  'Tasks',
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
      // A short window so async init errors surface; it fails on the first one.
      await assertStaysStable(() => errors, [], {
        windowMs: 400,
        message: `Console errors on ${tabName} mount`,
      });
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

// 5. Glossary cap / empty / cap-message flows

test('glossary: empty state renders at 0 entries', async () => {
  const { page, errors } = await openOptions(ext.context, ext.extensionId);

  await test.step('navigate to Glossary', async () => {
    await clickTab(page, 'Glossary');
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
  });

  await test.step('fill and submit add-entry form', async () => {
    const addSection = page.locator('[data-ega-glossary-add]');
    await expect(addSection).toBeVisible({ timeout: 5_000 });
    await addSection.getByLabel(/^Term/i).fill('Ega');
    await addSection.getByLabel(/^Translation/i).fill('ega-translated');
    await addSection.getByRole('button', { name: /Add entry/i }).click();
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
  });

  await test.step('click "always" bubble mode radio', async () => {
    // bits-ui renders the radio as a button, so click the label row that wraps it.
    const bubbleModeGroup = page.locator('[data-ega-bubble-mode]');
    await expect(bubbleModeGroup).toBeVisible({ timeout: 5_000 });
    await bubbleModeGroup.getByText('Always', { exact: true }).click();
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
    const addSection = page1.locator('[data-ega-glossary-add]');
    await addSection.getByLabel(/^Term/i).fill('PersistTest');
    await addSection.getByLabel(/^Translation/i).fill('PersistTranslation');
    await addSection.getByRole('button', { name: /Add entry/i }).click();
    // Reload only once the write landed, or the reload races it.
    await expect
      .poll(async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.glossary.map((g) => g.term);
      })
      .toContain('PersistTest');
  });

  await test.step('reload and verify entry present', async () => {
    await page1.reload();
    await page1.waitForSelector('[role="tab"]', { timeout: 10_000 });
    await clickTab(page1, 'Glossary');
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
  });

  for (const subTabId of ['diagnostics', 'data', 'labs'] as const) {
    await test.step(`click ${subTabId} sub-tab`, async () => {
      const subTab = page.locator(`[data-ega-subtab="${subTabId}"]`);
      await expect(subTab).toBeVisible({ timeout: 5_000 });
      await subTab.click();
      await expect(page.locator(`#adv-pane-${subTabId}`)).toBeVisible();
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
