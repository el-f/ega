/* coverage: templating.templates-editor.a11y-templates-chip */
import { test } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';
import { assertA11y } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Advanced templates chip panel passes flow-level a11y gate', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  await page
    .locator('[data-ega-template-editor]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  // nested-interactive: bits-ui Tooltip.Trigger wraps each chip button in a second button.
  await assertA11y(page, { allow: ['color-contrast', 'nested-interactive'] });
});
