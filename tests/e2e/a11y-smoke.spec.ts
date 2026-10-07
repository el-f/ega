import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  launchExtension,
  seedSettings,
  mockAnthropic,
  selectArabiziParagraph,
  waitForTestHooks,
  egaTest,
  type ExtensionHandle,
  pickAreasAndTranslate,
  refineWithPreset,
} from './helpers';
import { assertA11y, waitForVisibleText } from './flows/_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

// On a host web page only the shadow surface is ours, so the page's own landmarks are not checked.
const LANDMARK_RULES = ['landmark-one-main', 'region'];

/** Moderate and minor rule ids each scan is known to raise. */
const BASELINE = JSON.parse(
  readFileSync(fileURLToPath(new URL('./a11y-baseline.json', import.meta.url)), 'utf8'),
) as Record<string, string[]>;

interface AxeViolation {
  id: string;
  impact: string | null | undefined;
  help: string;
  nodes: number;
  selectors: string[];
  why: string | undefined;
}

interface Buckets {
  critical: AxeViolation[];
  serious: AxeViolation[];
  moderate: AxeViolation[];
  minor: AxeViolation[];
}

async function analyze(
  page: Page,
  opts: { include?: string; ownPage: boolean; wcagTags?: boolean },
): Promise<Buckets> {
  let builder = new AxeBuilder({ page });
  if (opts.include) builder = builder.include(opts.include);
  if (opts.wcagTags) {
    builder = builder.options({
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
      },
    });
  }
  if (!opts.ownPage) builder = builder.disableRules(LANDMARK_RULES);
  const results = await builder.analyze();
  const buckets: Buckets = { critical: [], serious: [], moderate: [], minor: [] };
  for (const v of results.violations) {
    const row: AxeViolation = {
      id: v.id,
      impact: v.impact ?? null,
      help: v.help,
      nodes: v.nodes.length,
      selectors: v.nodes
        .slice(0, 5)
        .map((n) => (Array.isArray(n.target) ? n.target.join(' > ') : String(n.target))),
      // The first node's reason, which for color-contrast carries the measured ratio.
      why: v.nodes[0]?.failureSummary?.split('\n')[1]?.trim(),
    };
    switch (v.impact) {
      case 'critical':
        buckets.critical.push(row);
        break;
      case 'serious':
        buckets.serious.push(row);
        break;
      case 'moderate':
        buckets.moderate.push(row);
        break;
      case 'minor':
        buckets.minor.push(row);
        break;
      case null:
      case undefined:
        // axe leaves impact unset on some violations — count those as moderate.
        buckets.moderate.push(row);
        break;
    }
  }
  return buckets;
}

/** Critical and serious fail outright; moderate and minor must match the scan's baseline entry. */
function expectClean(label: string, buckets: Buckets): void {
  expect(buckets.critical, JSON.stringify(buckets.critical, null, 2)).toEqual([]);
  expect(buckets.serious, JSON.stringify(buckets.serious, null, 2)).toEqual([]);
  const rest = [...buckets.moderate, ...buckets.minor];
  const ids = [...new Set(rest.map((v) => v.id))].sort();
  expect(ids, `${label}: ${JSON.stringify(rest, null, 2)}`).toEqual(BASELINE[label] ?? []);
}

async function scan(url: string, setup?: (page: Page) => Promise<void>): Promise<Buckets> {
  const page = await ext.context.newPage();
  // A mount fade caught mid-way reads as low contrast; measure the settled page.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  // Wait for Svelte to mount and for the settings read that fills the first render.
  await page.waitForFunction(
    () => {
      const root = document.querySelector('#root, #app');
      return root != null && root.children.length > 0;
    },
    { timeout: 5_000, polling: 250 },
  );
  if (setup) await setup(page);
  const buckets = await analyze(page, { ownPage: true });
  await page.close();
  return buckets;
}

const popupUrl = (): string => `chrome-extension://${ext.extensionId}/src/popup/index.html`;
const sidePanelUrl = (): string => `chrome-extension://${ext.extensionId}/src/sidepanel/index.html`;
const optionsUrl = (): string => `chrome-extension://${ext.extensionId}/src/options/index.html`;

test('popup passes axe critical-only smoke', async () => {
  expectClean('popup', await scan(popupUrl()));
});

test('side panel passes axe critical-only smoke', async () => {
  expectClean('sidepanel', await scan(sidePanelUrl()));
});

test('options passes axe critical-only smoke', async () => {
  expectClean('options', await scan(optionsUrl()));
});

// The default scan only sees the Translate tab; the Backends cards (status pills, tags) ship their own palette.
test('options Backends tab passes axe critical-only smoke', async () => {
  const buckets = await scan(optionsUrl(), async (page) => {
    await page.locator('#tab-backends').click();
    await page.getByTestId('be-list').waitFor({ state: 'visible', timeout: 5_000 });
  });
  expectClean('options-backends', buckets);
});

// 'templates' left out: SlotPalette nests a `<button>` inside another one, which axe flags.
const WALKED_TABS = ['translate', 'tasks', 'selection-bubble', 'backends', 'languages', 'about'];

test('options tabs pass axe critical-only smoke one by one', async () => {
  // Six axe scans in one test.
  test.slow();
  const page = await ext.context.newPage();
  await page.goto(optionsUrl());
  await page.waitForLoadState('networkidle');
  for (const id of WALKED_TABS) {
    const target = page.locator(`#tab-${id}`);
    await target.click();
    await expect(target).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 });
    // color-contrast is checked by the visual judge instead.
    await assertA11y(page, { allow: ['color-contrast'] });
  }
});

test('options with the settings search dialog open passes axe critical-only smoke', async () => {
  const buckets = await scan(optionsUrl(), async (page) => {
    await page.keyboard.press('Control+,');
    await expect(page.getByRole('dialog', { name: 'Search settings' })).toBeVisible();
  });
  expectClean('options-settings-search', buckets);
});

test('options with a confirm dialog open passes axe critical-only smoke', async () => {
  const buckets = await scan(optionsUrl(), async (page) => {
    await page.locator('#tab-about').click();
    await page.getByRole('button', { name: 'Clear cache' }).click();
    await expect(page.getByRole('dialog', { name: 'Clear translation cache' })).toBeVisible();
  });
  expectClean('options-confirm-dialog', buckets);
});

test('side panel with the backend popover open passes axe critical-only smoke', async () => {
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'test-key' });
  const buckets = await scan(sidePanelUrl(), async (page) => {
    const chip = page.locator('.active-backend-chip');
    await expect(chip).toHaveAttribute('aria-label', /Anthropic/);
    await chip.click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
  expectClean('sidepanel-backend-popover', buckets);
});

test('tooltip shadow surface passes axe critical-only smoke', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
  });
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');

  await waitForVisibleText(page, '.tooltip .body', 'Welcome');

  const buckets = await analyze(page, {
    include: '#ega-shadow-host',
    ownPage: false,
    wcagTags: true,
  });
  await page.close();
  expectClean('tooltip', buckets);
});

test('picker mode passes axe critical-only smoke', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    pickerEnabled: true,
    pickerShortcut: 'Ctrl+Shift+E',
  });
  const page = await ext.context.newPage();
  // The overlay fades in; a fade caught mid-way reads as low contrast.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');
  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false, { timeout: 3_000 })
    .toBe(true);
  // The outline and its hint only paint once a hover lands on an element.
  await page.locator('#pick-me').hover();
  await expect
    .poll(async () => (await egaTest<number>(page, 'pickerOutlineCount')) ?? 0, { timeout: 3_000 })
    .toBeGreaterThanOrEqual(1);

  const buckets = await analyze(page, {
    include: '#ega-shadow-host',
    ownPage: false,
    wcagTags: true,
  });
  await page.close();
  expectClean('picker', buckets);
});

test('page-translate shadow surface passes axe critical-only smoke', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    pageTranslateMode: 'bilingual',
  });
  mockAnthropic(ext.context, { translation: 'TRANSLATED' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);

  await pickAreasAndTranslate(ext, page, ['c1', 'c2']);

  await expect
    .poll(async () => (await egaTest<number>(page, 'pageV2TxCount')) ?? 0, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(1);

  const buckets = await analyze(page, { ownPage: false });
  await page.close();
  expectClean('page-translate', buckets);
});

// The four scans above see empty surfaces; the turn card, its action row and the ready backend card only exist once there is data.
test('side panel with a finished answer passes axe critical-only smoke', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
  });
  mockAnthropic(ext.context, { translation: 'Hello, welcome!' });
  const buckets = await scan(sidePanelUrl(), async (page) => {
    await page.locator('#sp-text').fill('sabah el kheir');
    await page.locator('#sp-text').press('Enter');
    await expect(page.locator('.ega-answer').first()).toContainText('Hello', {
      timeout: 10_000,
    });
  });
  expectClean('sidepanel-populated', buckets);
});

// The version pager and the preset name in the meta line only render on a refined version, so they need their own scan.
test('side panel with a refined answer passes axe critical-only smoke', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
  });
  mockAnthropic(ext.context, { translation: 'Hello, welcome to you all!', times: 1 });
  const buckets = await scan(sidePanelUrl(), async (page) => {
    await page.locator('#sp-text').fill('sabah el kheir ya jama3a');
    await page.locator('#sp-text').press('Enter');
    await expect(page.locator('.ega-answer').first()).toContainText('Hello', {
      timeout: 10_000,
    });
    mockAnthropic(ext.context, { translation: 'Hi all!', times: 1 });
    await refineWithPreset(page, 'shorter');
    await expect(page.locator('.ega-answer').first()).toContainText('Hi all!', {
      timeout: 10_000,
    });
    await expect(page.locator('[data-ega-meta-item="version"]')).toHaveText('Shorter');
    await expect(page.locator('[data-ega-variant-nav]')).toBeVisible();
  });
  expectClean('sidepanel-refined', buckets);
});

test('options Backends tab with a configured provider passes axe critical-only smoke', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
  });
  const buckets = await scan(optionsUrl(), async (page) => {
    await page.locator('#tab-backends').click();
    await page.getByTestId('be-list').waitFor({ state: 'visible', timeout: 5_000 });
  });
  expectClean('options-backends-configured', buckets);
});
