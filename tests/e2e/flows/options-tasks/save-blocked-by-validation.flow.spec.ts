/* coverage: options.tasks.save-blocked-by-validation */
import { test, expect } from '@playwright/test';
import { launchExtension, openTaskPrompt, readStorage, type ExtensionHandle } from '../../helpers';
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

test('deleting {{text}} blocks Save and leaves storage unchanged', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openTaskPrompt(page, 'translate');
  timeline.markStep('tab-open');

  await expect(page.locator('[data-ega-template-editor]').first()).toBeVisible({
    timeout: 10_000,
  });
  timeline.markStep('editor-mounted');

  const before = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  const originalUser = before?.advanced.promptTemplate.user ?? '';

  const usrTextarea = page.locator('[data-ega-template-user] textarea').first();
  await usrTextarea.click();
  await usrTextarea.fill('No required slot here.');
  timeline.markStep('required-slot-removed');

  const saveBtn = page.locator('[data-ega-template-save]').first();
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
  await saveBtn.click();
  timeline.markStep('save-clicked');

  // Other role="alert" nodes exist (an empty live region, the palette badge), so match by text.
  await expect(page.locator('[role="alert"]', { hasText: /must include/i })).toBeVisible({
    timeout: 5_000,
  });

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.promptTemplate.user ?? '';
      },
      { timeout: 5_000 },
    )
    .toBe(originalUser);
  timeline.markStep('storage-unchanged');
});
