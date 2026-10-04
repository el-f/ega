/* coverage: options.tasks.insert-at-cursor-into-sys */
import { test, expect } from '@playwright/test';
import { launchExtension, openTaskPrompt, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('clicking a slot chip after focusing system textarea inserts token into system field', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openTaskPrompt(page, 'translate');
  timeline.markStep('tab-open');

  await expect(page.locator('[data-ega-template-editor]').first()).toBeVisible({
    timeout: 10_000,
  });
  timeline.markStep('editor-mounted');

  const sysTextarea = page.locator('[data-ega-template-system] textarea').first();
  await expect(sysTextarea).toBeVisible({ timeout: 5_000 });

  const initialSys = await sysTextarea.inputValue();
  await sysTextarea.click();
  await page.keyboard.press('End');
  timeline.markStep('sys-focused');

  const usrTextarea = page.locator('[data-ega-template-user] textarea').first();
  const initialUsr = await usrTextarea.inputValue();

  // langLabel is always listed for the translate task, so this chip is always on screen.
  const langLabelChip = page
    .locator('[data-ega-slot-palette] [data-ega-slot-chip="langLabel"]')
    .first();
  await expect(langLabelChip).toBeVisible({ timeout: 5_000 });
  await langLabelChip.click();
  timeline.markStep('chip-clicked');

  await expect
    .poll(async () => await sysTextarea.inputValue(), { timeout: 5_000 })
    .toContain('{{langLabel}}');

  expect(await usrTextarea.inputValue()).toBe(initialUsr);
  timeline.markStep('token-in-sys-asserted');

  expect(await sysTextarea.inputValue()).not.toBe(initialSys);
});
