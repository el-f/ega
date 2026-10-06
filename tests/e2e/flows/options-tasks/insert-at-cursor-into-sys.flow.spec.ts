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

test('Insert variable puts the token at the caret of the Instructions when they had focus last', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openTaskPrompt(page, 'translate');
  timeline.markStep('editor-mounted');

  const sysTextarea = page.locator('[data-ega-template-system] textarea').first();
  const usrTextarea = page.locator('[data-ega-template-user] textarea').first();
  const initialUsr = await usrTextarea.inputValue();
  await sysTextarea.click();
  await page.keyboard.press('Control+End');
  timeline.markStep('sys-focused');

  await page.locator('[data-ega-slot-insert-picker]').click();
  await page.locator('[data-ega-variable-picker] [data-ega-variable="langLabel"]').click();
  timeline.markStep('variable-picked');

  await expect(sysTextarea).toBeFocused();
  await expect
    .poll(() => sysTextarea.inputValue(), { timeout: 5_000 })
    .toMatch(/\{\{langLabel\}\}$/);
  expect(await usrTextarea.inputValue()).toBe(initialUsr);
  timeline.markStep('token-in-sys-asserted');
});
