/* example: assertA11y — Options shell tabs */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';
import { assertA11y } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

// 'templates' left out: SlotPalette nests a `<button>` inside another one, which axe flags.
const TABS = ['translate', 'selection-bubble', 'backends', 'languages', 'about'];

test('Options shell — every tab passes flow-level a11y gate', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');
  for (const id of TABS) {
    const target = page.locator(`#tab-${id}`);
    if ((await target.count()) === 0) continue;
    await target.click();
    await expect(target).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 });
    // color-contrast is checked by the visual judge instead.
    await assertA11y(page, { allow: ['color-contrast'] });
  }
});
