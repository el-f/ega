import { test, expect, type Page } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from './helpers';
import { checkDesignRules, designRuleViolations } from './design-rules';
import {
  GATE_PLATFORM,
  GATE_SURFACES,
  GATE_THEMES,
  GATE_WIDTHS,
  gateKey,
  optionsSurface,
} from './design-rules-gate';
import { SETTINGS_TABS } from '../../src/shared/settings-tabs';

// The design-rules gate: every main surface at the side panel's width and at desktop width, light and dark.

let ext: ExtensionHandle | undefined;

test.afterEach(async () => {
  await ext?.close();
  ext = undefined;
});

/** Checks the page at each width under one baseline key per width. */
async function checkAtEveryWidth(page: Page, surface: string, theme: string): Promise<void> {
  for (const w of GATE_WIDTHS) {
    await page.setViewportSize({ width: w.width, height: w.height });
    // A resize settles in the next frames; two rAFs see the new layout.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    await checkDesignRules(page, gateKey(surface, w.name, theme));
  }
}

test.describe('gate', () => {
  test.skip(
    process.platform !== GATE_PLATFORM,
    'The gate- baseline keys hold what the Linux CI runner finds, and text is a different width on this platform. For a local check use screenshot-audit: pnpm visual:capture.',
  );

  for (const theme of GATE_THEMES) {
    test(`popup, side panel and every options tab keep the design rules (${theme})`, async () => {
      test.slow();
      ext = await launchExtension({ colorScheme: theme });
      await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'sk-test' });

      const popup = await ext.context.newPage();
      await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
      await popup.locator('#pop-lang').waitFor();
      await checkAtEveryWidth(popup, GATE_SURFACES.popup, theme);
      await popup.close();

      mockAnthropic(ext.context, { translation: 'Hello, friend.' });
      const panel = await ext.context.newPage();
      await panel.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
      await expect(panel.locator('[data-ega-empty-state]')).toBeVisible();
      await checkAtEveryWidth(panel, GATE_SURFACES.sidepanelEmpty, theme);
      await panel.locator('#sp-text').fill('hola amigo');
      await panel.getByRole('button', { name: /^Translate$/ }).click();
      await expect(panel.locator('.ega-assistant-body').first()).toContainText('Hello, friend.', {
        timeout: 10_000,
      });
      await checkAtEveryWidth(panel, GATE_SURFACES.sidepanelExchange, theme);
      await panel.close();

      const options = await ext.context.newPage();
      await options.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
      for (const tab of SETTINGS_TABS) {
        await options.locator(`#tab-${tab.id}`).click();
        await expect(
          options.locator(`#tabpanel-${tab.id}`).getByRole('heading', { name: tab.label }).first(),
        ).toBeVisible();
        await checkAtEveryWidth(options, optionsSurface(tab.id), theme);
        await options.setViewportSize({
          width: GATE_WIDTHS[1].width,
          height: GATE_WIDTHS[1].height,
        });
      }
    });
  }
});

test('flags cut-off text, undeclared ellipsis and off-scale font sizes, and nothing else', async () => {
  ext = await launchExtension();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await page.locator('#pop-lang').waitFor();
  // Text widths differ by platform, so the popup's own findings do too; the probe checks only what it adds.
  const popupOwn = await designRuleViolations(page);

  await page.evaluate(() => {
    const ellipsis = 'display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis';
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
      // R17: an ellipsis passes only on text marked data-ega-truncates whose full text is in a written name.
      `<button aria-label="Open: A label far too long for this button" style="width:120px;font-size:var(--fs-sm)"><span data-ega-probe-ok-aria data-ega-truncates style="${ellipsis}">A label far too long for this button</span></button>`,
      `<span data-ega-probe-ok-title data-ega-truncates title="A title far too long for its box" style="${ellipsis};width:100px;font-size:var(--fs-sm)">A title far too long for its box</span>`,
      '<span id="ega-probe-name" class="ega-sr-only">A name far too long for its box</span>',
      `<span data-ega-probe-ok-labelledby data-ega-truncates aria-labelledby="ega-probe-name" style="${ellipsis};width:100px;font-size:var(--fs-sm)">A name far too long for its box</span>`,
      `<button aria-label="Row: A conversation title far too long" style="width:120px;font-size:var(--fs-sm)"><span><span data-ega-probe-ok-ancestor data-ega-truncates style="${ellipsis}">A conversation title far too long</span></span></button>`,
      `<div data-ega-truncates><span data-ega-probe-marker-above title="A title far too long for its box" style="${ellipsis};width:100px;font-size:var(--fs-sm)">A title far too long for its box</span></div>`,
      `<button aria-label="Open" style="width:120px;font-size:var(--fs-sm)"><span data-ega-probe-partial-name data-ega-truncates style="${ellipsis}">Another label far too long here</span></button>`,
      `<span data-ega-probe-no-name data-ega-truncates style="${ellipsis};width:100px;font-size:var(--fs-sm)">An unnamed label far too long</span>`,
      `<button aria-label="A label far too long for this button" style="width:120px;font-size:var(--fs-sm)"><span data-ega-probe-no-marker style="${ellipsis}">A label far too long for this button</span></button>`,
    ].join('');
    document.body.prepend(box);
  });

  const added = (await designRuleViolations(page)).filter((v) => !popupOwn.includes(v));
  expect(added).toEqual([
    'clip button[data-ega-probe-clip] "Translate this page"',
    'clip div[data-ega-probe-tab] "Appearance"',
    'clip span[data-ega-probe-ellipsis] "A label far too long for this button"',
    'clip span[data-ega-probe-marker-above] "A title far too long for its box"',
    'clip span[data-ega-probe-no-marker] "A label far too long for this button"',
    'clip span[data-ega-probe-no-name] "An unnamed label far too long"',
    'clip span[data-ega-probe-partial-name] "Another label far too long here"',
    'clip-y button[data-ega-probe-tall] "Two words"',
    'font 11px span[data-ega-probe-tiny] "Tiny meta"',
  ]);
});
