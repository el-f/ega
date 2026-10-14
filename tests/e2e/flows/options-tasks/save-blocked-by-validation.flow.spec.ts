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

test('deleting {{text}} keeps the stored prompt as it was', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openTaskPrompt(page, 'translate');
  timeline.markStep('editor-mounted');

  const before = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  const originalUser = before?.advanced.promptTemplate.user ?? '';

  const usrTextarea = page.locator('[data-ega-template-user] textarea').first();
  await usrTextarea.click();
  await usrTextarea.fill('No required slot here, only {{targetLangLabel}}.');
  timeline.markStep('text-slot-removed');

  await expect(page.locator('[data-ega-prompt-error]')).toBeVisible();
  await expect(page.locator('[data-ega-dialog-status]')).toHaveText(
    'Not saved: the message needs the Selected text variable',
  );
  timeline.markStep('status-says-not-saved');

  // Past the save pause, nothing was written.
  await page.waitForTimeout(1_000);
  const after = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  expect(after?.advanced.promptTemplate.user ?? '').toBe(originalUser);
  timeline.markStep('storage-unchanged');
});
