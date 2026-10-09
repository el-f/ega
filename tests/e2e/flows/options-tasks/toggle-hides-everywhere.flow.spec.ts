/* coverage: options.tasks.toggle-hides-everywhere */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  readStorage,
  seedSettings,
  selectArabiziParagraph,
  sendFromPanel,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('turning Reword off hides it in the task picker, palette, Answer again and tooltip', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Hello', confidence: 0.9 });

  const options = await ext.context.newPage();
  await options.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await options.locator('#tab-tasks').click();
  await options.locator('[data-ega-task-toggle="reword"]').uncheck();
  await expect
    .poll(
      async () =>
        (await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings'))?.disabledTasks,
      { timeout: 5_000 },
    )
    .toEqual(['reword']);
  await expect(options.locator('[data-ega-task-toggle="reword"]')).not.toBeChecked();
  timeline.markStep('reword-off');

  const panel = await ext.context.newPage();
  await panel.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await panel.locator('[data-ega-mode-chip]').click();
  const picker = panel.locator('[data-ega-mode-popover]');
  await expect(picker.locator('[data-ega-task="summarize"]')).toBeVisible();
  await expect(picker.locator('[data-ega-task="reword"]')).toHaveCount(0);
  await panel.keyboard.press('Escape');
  timeline.markStep('task-picker');

  await sendFromPanel(panel, 'marhaba');
  const more = panel.locator('[data-ega-reply] [data-ega-action="more"]');
  await expect(more).toBeVisible({ timeout: 10_000 });
  await more.click();
  const items = panel.locator('[data-ega-answer-again]');
  await expect(items.first()).toBeVisible();
  const againValues = await items.evaluateAll((os) =>
    os.map((o) => o.getAttribute('data-ega-answer-again')),
  );
  expect(againValues).toContain('summarize');
  expect(againValues).not.toContain('reword');
  await panel.keyboard.press('Escape');
  await expect(items).toHaveCount(0);
  timeline.markStep('answer-again');

  // Arrowing through the menu only moves the highlight: no re-run starts, and Escape returns focus.
  await more.focus();
  await panel.keyboard.press('Enter');
  await expect(items.first()).toBeVisible();
  await panel.keyboard.press('ArrowDown');
  await panel.keyboard.press('ArrowDown');
  // The panel's j/k navigation must not take the arrows: focus stays in the menu, no message gets the ring.
  await expect(panel.locator('[role="menu"] :focus')).toHaveCount(1);
  await expect(panel.locator('[data-ega-reply].focused, .ega-user-turn.focused')).toHaveCount(0);
  await panel.keyboard.press('Escape');
  await expect(items).toHaveCount(0);
  await expect(more).toBeFocused();
  await expect(panel.locator('[data-ega-variant-nav]')).toHaveCount(0);
  await expect(panel.locator('[data-ega-reply]')).toHaveCount(1);
  timeline.markStep('menu-keyboard');

  await panel.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  const input = panel.getByRole('combobox', { name: 'Command palette' });
  await expect(input).toBeFocused({ timeout: 5_000 });
  await input.fill('Set default task');
  const results = panel.getByRole('listbox', { name: 'Command results' });
  await expect(results.getByRole('option', { name: /Set default task: Summarize/ })).toBeVisible();
  await expect(results.getByRole('option', { name: /Set default task: Reword/ })).toHaveCount(0);
  await panel.keyboard.press('Escape');
  timeline.markStep('palette');

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const root = (document.querySelector('#ega-shadow-host') as HTMLElement | null)
            ?.shadowRoot;
          const select = root?.querySelector('select[data-ega-task-select]');
          return select
            ? [...select.querySelectorAll('option')].map((o) => (o as HTMLOptionElement).value)
            : null;
        }),
      { timeout: 10_000 },
    )
    .toEqual(['translate', 'explain', 'summarize', 'grammar', 'suggest-replies', 'ask']);
  timeline.markStep('tooltip');
  timeline.report();
});
