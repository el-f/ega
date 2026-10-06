import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from './helpers';
import { designRuleViolations } from './design-rules';

// The checker every audit capture runs: it sees a break (an unstyled button's 13.33px UA font counts) and stays quiet on a clean page.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('flags cut-off control text and off-scale font sizes, and nothing else', async () => {
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
    ].join('');
    document.body.prepend(box);
  });

  expect(await designRuleViolations(page)).toEqual([
    'clip button[data-ega-probe-clip] "Translate this page"',
    'font 11px span[data-ega-probe-tiny] "Tiny meta"',
  ]);
});
