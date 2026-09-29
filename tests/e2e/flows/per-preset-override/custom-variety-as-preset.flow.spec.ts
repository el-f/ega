/* coverage: templating.per-preset-override.custom-variety-as-preset */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const CUSTOM_ID = 'e2e-testlang-custom';
const CUSTOM_LABEL = 'E2E TestLang';
const MARKER = '/* EGA-CUSTOM-VARIETY-PRESET-SAVE */ ';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();

  // Seed ega.customLanguages directly — separate storage key from settings.
  const optionsPage = await ext.context.newPage();
  try {
    await optionsPage.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    await optionsPage.evaluate(
      async ({ id, label, createdAt }: { id: string; label: string; createdAt: number }) => {
        const key = 'ega.customLanguages';
        const entry = { id, label, hint: 'A test custom variety.', examples: [], createdAt };
        await chrome.storage.local.set({ [key]: [entry] });
      },
      { id: CUSTOM_ID, label: CUSTOM_LABEL, createdAt: Date.now() },
    );
  } finally {
    await optionsPage.close();
  }
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('custom variety appears in the Custom optgroup and can receive a per-preset override', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="per-preset"]').click();
  timeline.markStep('chip-open');

  // Playwright never reports <optgroup> as visible, so assert attachment instead.
  const select = page.locator('[data-ega-prompt-workbench] select').first();
  await expect(select).toBeVisible({ timeout: 10_000 });
  const optgroup = page.locator('[data-ega-prompt-workbench] select optgroup[label="Custom"]');
  await expect(optgroup).toBeAttached({ timeout: 10_000 });
  await expect(optgroup.locator(`option[value="${CUSTOM_ID}"]`)).toBeAttached({ timeout: 5_000 });
  timeline.markStep('custom-optgroup-visible');

  await select.selectOption(CUSTOM_ID);
  timeline.markStep('custom-picked');

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
        return s?.advanced.perPresetTemplates[CUSTOM_ID]?.system ?? '';
      },
      { timeout: 10_000 },
    )
    .toContain(MARKER);
});
