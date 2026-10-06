import { test, expect, type Page } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from './helpers';
import { checkDesignRules, designRuleViolations, uncheckedBaselineKeys } from './design-rules';
import { SETTINGS_TABS } from '../../src/shared/settings-tabs';

// The design-rules gate: every main surface at the side panel's width and at desktop width, light and dark.

const WIDTHS = [
  { name: '400', width: 400, height: 760 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;
const THEMES = ['light', 'dark'] as const;
const GATE = 'gate-';

let ext: ExtensionHandle | undefined;
let gateRuns = 0;

test.afterEach(async () => {
  await ext?.close();
  ext = undefined;
});

/** Checks the page at each width under one baseline key per width. */
async function checkAtEveryWidth(page: Page, surface: string, theme: string): Promise<void> {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w.width, height: w.height });
    // A resize settles in the next frames; two rAFs see the new layout.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    await checkDesignRules(page, `${GATE}${surface}-${w.name}-${theme}`);
  }
}

for (const theme of THEMES) {
  test(`popup, side panel and every options tab keep the design rules (${theme})`, async () => {
    test.slow();
    ext = await launchExtension({ colorScheme: theme });
    await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'sk-test' });

    const popup = await ext.context.newPage();
    await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
    await popup.locator('#pop-lang').waitFor();
    await checkAtEveryWidth(popup, 'popup', theme);
    await popup.close();

    mockAnthropic(ext.context, { translation: 'Hello, friend.' });
    const panel = await ext.context.newPage();
    await panel.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
    await expect(panel.locator('[data-ega-empty-state]')).toBeVisible();
    await checkAtEveryWidth(panel, 'sidepanel-empty', theme);
    await panel.locator('#sp-text').fill('hola amigo');
    await panel.getByRole('button', { name: /^Translate$/ }).click();
    await expect(panel.locator('.ega-assistant-body').first()).toContainText('Hello, friend.', {
      timeout: 10_000,
    });
    await checkAtEveryWidth(panel, 'sidepanel-exchange', theme);
    await panel.close();

    const options = await ext.context.newPage();
    await options.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    for (const tab of SETTINGS_TABS) {
      await options.locator(`#tab-${tab.id}`).click();
      await expect(
        options.locator(`#tabpanel-${tab.id}`).getByRole('heading', { name: tab.label }).first(),
      ).toBeVisible();
      await checkAtEveryWidth(options, `options-${tab.id}`, theme);
      await options.setViewportSize({ width: WIDTHS[1].width, height: WIDTHS[1].height });
    }
    gateRuns += 1;
  });
}

test.afterAll(() => {
  // Only a run that captured every surface can tell a stale key from a skipped one.
  if (gateRuns < THEMES.length) return;
  expect(uncheckedBaselineKeys(GATE), 'baseline keys no capture checks any more').toEqual([]);
});

test('flags cut-off control text and off-scale font sizes, and nothing else', async () => {
  ext = await launchExtension();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await page.locator('#pop-lang').waitFor();
  expect(await designRuleViolations(page)).toEqual([]);

  await page.evaluate(() => {
    const box = document.createElement('div');
    box.innerHTML = [
      '<button data-ega-probe-clip style="width:40px;overflow:hidden;white-space:nowrap;font-size:var(--fs-sm)">Translate this page</button>',
      '<span data-ega-probe-tiny style="font-size:11px">Tiny meta</span>',
      '<label class="ega-sr-only">Screen reader only label</label>',
      '<button style="width:200px;font-size:var(--fs-sm)">Fits</button>',
      '<button style="width:120px;font-size:var(--fs-sm)"><span data-ega-probe-ellipsis style="display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">A label far too long for this button</span></button>',
      '<div role="tab" data-ega-probe-tab style="width:30px;overflow:hidden;white-space:nowrap;font-size:var(--fs-sm)">Appearance</div>',
      '<button data-ega-probe-tall style="width:200px;height:12px;overflow:hidden;font-size:var(--fs-sm)">Two words</button>',
      '<span style="display:block;width:300px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:var(--fs-sm)">Short</span>',
    ].join('');
    document.body.prepend(box);
  });

  expect(await designRuleViolations(page)).toEqual([
    'clip button[data-ega-probe-clip] "Translate this page"',
    'clip div[data-ega-probe-tab] "Appearance"',
    'clip span[data-ega-probe-ellipsis] "A label far too long for this button"',
    'clip-y button[data-ega-probe-tall] "Two words"',
    'font 11px span[data-ega-probe-tiny] "Tiny meta"',
  ]);
});
