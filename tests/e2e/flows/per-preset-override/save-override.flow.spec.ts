/* coverage: templating.per-preset-override.save-override */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const PRESET_ID = 'arabizi';
const MARKER = '/* EGA-TEST-PER-PRESET-SAVE */ ';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Save persists perPresetTemplates[preset] with the edited body', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="per-preset"]').click();
  await page.locator('[data-ega-prompt-workbench] select').first().selectOption(PRESET_ID);
  timeline.markStep('preset-picked');

  await expect(
    page.locator('[data-ega-prompt-workbench] [data-ega-template-editor]').first(),
  ).toBeVisible({ timeout: 10_000 });

  const sysSurface = page
    .locator('[data-ega-prompt-workbench] [data-ega-template-system] textarea')
    .first();
  await sysSurface.click();
  await page.keyboard.press('Home');
  await page.keyboard.type(MARKER);
  timeline.markStep('typed');

  const saveBtn = page.locator('[data-ega-prompt-workbench] [data-ega-template-save]').first();
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
  await saveBtn.click();
  timeline.markStep('saved');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.perPresetTemplates[PRESET_ID]?.system ?? '';
      },
      { timeout: 10_000 },
    )
    .toContain(MARKER);
});
