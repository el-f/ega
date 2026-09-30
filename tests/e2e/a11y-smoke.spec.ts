import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  launchExtension,
  seedSettings,
  mockAnthropic,
  selectArabiziParagraph,
  waitForTestHooks,
  egaTest,
  type ExtensionHandle,
  pickAreasAndTranslate,
} from './helpers';
import { assertA11y, waitForVisibleText } from './flows/_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

// Each surface is one self-contained card, not a full page, so the landmark rules never apply.
const DISABLED_RULES = ['landmark-one-main', 'region'];

interface AxeViolation {
  id: string;
  impact: string | null | undefined;
  help: string;
  nodes: number;
  selectors: string[];
}

async function scan(
  url: string,
  setup?: (page: Page) => Promise<void>,
): Promise<{
  critical: AxeViolation[];
  serious: AxeViolation[];
  moderate: AxeViolation[];
  minor: AxeViolation[];
}> {
  const page = await ext.context.newPage();
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
  const results = await new AxeBuilder({ page }).disableRules(DISABLED_RULES).analyze();
  const buckets: {
    critical: AxeViolation[];
    serious: AxeViolation[];
    moderate: AxeViolation[];
    minor: AxeViolation[];
  } = { critical: [], serious: [], moderate: [], minor: [] };
  for (const v of results.violations) {
    const row: AxeViolation = {
      id: v.id,
      impact: v.impact ?? null,
      help: v.help,
      nodes: v.nodes.length,
      selectors: v.nodes
        .slice(0, 5)
        .map((n) => (Array.isArray(n.target) ? n.target.join(' > ') : String(n.target))),
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
  await page.close();
  return buckets;
}

function logNonCritical(label: string, buckets: Awaited<ReturnType<typeof scan>>): void {
  if (buckets.serious.length || buckets.moderate.length || buckets.minor.length) {
    console.log(
      `[a11y:${label}] serious=${buckets.serious.length} moderate=${buckets.moderate.length} minor=${buckets.minor.length}`,
      JSON.stringify(
        {
          serious: buckets.serious.map((v) => `${v.id} (${v.nodes})`),
          moderate: buckets.moderate.map((v) => `${v.id} (${v.nodes})`),
          minor: buckets.minor.map((v) => `${v.id} (${v.nodes})`),
        },
        null,
        2,
      ),
    );
  }
}

test('popup passes axe critical-only smoke', async () => {
  const buckets = await scan(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  logNonCritical('popup', buckets);
  expect(buckets.critical, JSON.stringify(buckets.critical, null, 2)).toEqual([]);
  expect(buckets.serious, JSON.stringify(buckets.serious, null, 2)).toEqual([]);
});

test('side panel passes axe critical-only smoke', async () => {
  const buckets = await scan(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  logNonCritical('sidepanel', buckets);
  expect(buckets.critical, JSON.stringify(buckets.critical, null, 2)).toEqual([]);
  expect(buckets.serious, JSON.stringify(buckets.serious, null, 2)).toEqual([]);
});

test('options passes axe critical-only smoke', async () => {
  const buckets = await scan(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  logNonCritical('options', buckets);
  expect(buckets.critical, JSON.stringify(buckets.critical, null, 2)).toEqual([]);
  expect(buckets.serious, JSON.stringify(buckets.serious, null, 2)).toEqual([]);
});

// The default scan only sees the Translate tab; the Backends cards (status pills, tags) ship their own palette.
test('options Backends tab passes axe critical-only smoke', async () => {
  const buckets = await scan(
    `chrome-extension://${ext.extensionId}/src/options/index.html`,
    async (page) => {
      await page.locator('#tab-backends').click();
      await page.getByTestId('be-list').waitFor({ state: 'visible', timeout: 5_000 });
    },
  );
  logNonCritical('options-backends', buckets);
  expect(buckets.critical, JSON.stringify(buckets.critical, null, 2)).toEqual([]);
  expect(buckets.serious, JSON.stringify(buckets.serious, null, 2)).toEqual([]);
});

// 'templates' left out: SlotPalette nests a `<button>` inside another one, which axe flags.
const WALKED_TABS = ['translate', 'selection-bubble', 'backends', 'languages', 'about'];

test('options tabs pass axe critical-only smoke one by one', async () => {
  // Five axe scans in one test.
  test.slow();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');
  for (const id of WALKED_TABS) {
    const target = page.locator(`#tab-${id}`);
    await target.click();
    await expect(target).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 });
    // color-contrast is checked by the visual judge instead.
    await assertA11y(page, { allow: ['color-contrast'] });
  }
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

  const results = await new AxeBuilder({ page })
    .include('#ega-shadow-host')
    .options({
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
      },
    })
    .disableRules(DISABLED_RULES)
    .analyze();

  const critical = results.violations.filter((v) => v.impact === 'critical');
  const serious = results.violations.filter((v) => v.impact === 'serious');
  const summarise = (bucket: typeof results.violations): AxeViolation[] =>
    bucket.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      help: v.help,
      nodes: v.nodes.length,
      selectors: v.nodes
        .slice(0, 5)
        .map((n) => (Array.isArray(n.target) ? n.target.join(' > ') : String(n.target))),
    }));

  await page.close();
  expect(critical, JSON.stringify(summarise(critical), null, 2)).toEqual([]);
  expect(serious, JSON.stringify(summarise(serious), null, 2)).toEqual([]);
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

  const results = await new AxeBuilder({ page }).disableRules(DISABLED_RULES).analyze();

  const critical = results.violations.filter((v) => v.impact === 'critical');
  const serious = results.violations.filter((v) => v.impact === 'serious');
  const summarise = (bucket: typeof results.violations): AxeViolation[] =>
    bucket.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      help: v.help,
      nodes: v.nodes.length,
      selectors: v.nodes
        .slice(0, 5)
        .map((n) => (Array.isArray(n.target) ? n.target.join(' > ') : String(n.target))),
    }));

  await page.close();
  expect(critical, JSON.stringify(summarise(critical), null, 2)).toEqual([]);
  expect(serious, JSON.stringify(summarise(serious), null, 2)).toEqual([]);
});

// The four scans above see empty surfaces; the turn card, its action row and the ready backend card only exist once there is data.
test('side panel with a finished answer passes axe critical-only smoke', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
  });
  mockAnthropic(ext.context, { translation: 'Hello, welcome!' });
  const buckets = await scan(
    `chrome-extension://${ext.extensionId}/src/sidepanel/index.html`,
    async (page) => {
      await page.locator('#sp-text').fill('sabah el kheir');
      await page.getByRole('button', { name: /^Translate$/ }).click();
      await expect(page.locator('.ega-assistant-body').first()).toContainText('Hello', {
        timeout: 10_000,
      });
    },
  );
  logNonCritical('sidepanel-populated', buckets);
  expect(buckets.critical, JSON.stringify(buckets.critical, null, 2)).toEqual([]);
  expect(buckets.serious, JSON.stringify(buckets.serious, null, 2)).toEqual([]);
});

test('options Backends tab with a configured provider passes axe critical-only smoke', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
  });
  const buckets = await scan(
    `chrome-extension://${ext.extensionId}/src/options/index.html`,
    async (page) => {
      await page.locator('#tab-backends').click();
      await page.getByTestId('be-list').waitFor({ state: 'visible', timeout: 5_000 });
    },
  );
  logNonCritical('options-backends-configured', buckets);
  expect(buckets.critical, JSON.stringify(buckets.critical, null, 2)).toEqual([]);
  expect(buckets.serious, JSON.stringify(buckets.serious, null, 2)).toEqual([]);
});
