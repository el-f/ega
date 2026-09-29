/* coverage: templating.templates-editor.save-persists */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('typing then Save persists the new system template body to storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('advanced-open');

  await expect(page.locator('[data-ega-template-editor]').first()).toBeVisible({
    timeout: 10_000,
  });
  timeline.markStep('editor-mounted');

  const saveBtn = page.locator('[data-ega-template-save]').first();
  await expect(saveBtn).toBeDisabled();

  const sysSurface = page.locator('[data-ega-template-system] textarea').first();
  await sysSurface.click();
  await page.keyboard.press('Home');
  const MARKER = '/* EGA-TEST-SAVE-PERSISTS */ ';
  await page.keyboard.type(MARKER);
  timeline.markStep('typed-marker');

  await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
  await saveBtn.click();
  timeline.markStep('save-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.promptTemplate.system ?? '';
      },
      { timeout: 10_000 },
    )
    .toContain(MARKER);
  timeline.markStep('persisted');

  await expect(saveBtn).toBeDisabled({ timeout: 5_000 });
});
