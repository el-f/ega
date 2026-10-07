/* coverage: options.tasks.add-custom-task-appears-in-pickers */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  readStorage,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

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

test('a new task from the Tasks tab shows in the chip strip and the tooltip select', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Hello', confidence: 0.9 });
  const options = await ext.context.newPage();
  await options.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await options.locator('#tab-tasks').click();
  await options.locator('[data-ega-custom-task-new]').click();
  const dialog = options.locator('[data-ega-custom-task-dialog]');
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.locator('[data-ega-custom-task-name]').fill('Tweet summary');
  await dialog.locator('[data-ega-custom-task-system]').fill('Summarize as one tweet.');
  // A variable chip inserts at the caret of the field focused last, here the Instructions.
  await dialog.locator('[data-ega-custom-task-system]').focus();
  await dialog.locator('[data-ega-custom-task-system]').press('End');
  await dialog.locator('[data-ega-slot-chip="targetLangLabel"]').click();
  await expect(dialog.locator('[data-ega-custom-task-system]')).toHaveValue(
    'Summarize as one tweet.{{targetLangLabel}}',
  );
  await dialog.locator('[data-ega-custom-task-user]').fill('Thread: {{text}}');
  await dialog.locator('[data-ega-custom-task-output]').getByText('Answer with notes').click();
  await dialog.locator('[data-ega-custom-task-effort] select').selectOption('low');
  await dialog.locator('[data-ega-custom-task-page-context]').check();
  await dialog.locator('[data-ega-custom-task-image]').check();
  await dialog.locator('[data-ega-custom-task-glossary]').check();
  await dialog.locator('[data-ega-compile-preview] summary').click();
  await expect(dialog.locator('[data-ega-preview-system]')).toContainText(
    'Summarize as one tweet.',
  );
  await expect(dialog.locator('[data-ega-preview-history]')).toBeVisible();
  await expect(dialog.locator('[data-ega-preview-user]')).toContainText('Thread:');
  timeline.markStep('previewed');
  await options.locator('[data-ega-custom-task-save]').click();
  await expect
    .poll(
      async () =>
        (
          (await readStorage<Record<string, unknown>[]>(
            ext.context,
            ext.extensionId,
            'ega.customTasks',
          )) ?? []
        ).map(({ id: _id, createdAt: _c, ...rest }) => rest),
      { timeout: 5_000 },
    )
    .toEqual([
      {
        label: 'Tweet summary',
        system: 'Summarize as one tweet.{{targetLangLabel}}',
        user: 'Thread: {{text}}',
        output: 'card',
        effort: 'low',
        pageContext: true,
        image: true,
        glossary: true,
      },
    ]);
  await expect(options.locator('[data-ega-custom-task-list]')).toContainText('Tweet summary');
  timeline.markStep('saved');

  const panel = await ext.context.newPage();
  await panel.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  // The task picker lives in the composer's "Next message" popover.
  await panel.locator('[data-ega-mode-chip]').click({ timeout: 5_000 });
  await expect(
    panel.locator('[data-ega-mode-popover]').getByRole('radio', { name: 'Tweet summary' }),
  ).toBeVisible({ timeout: 5_000 });
  await panel.keyboard.press('Escape');
  timeline.markStep('task-picker');

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
            ? [...select.querySelectorAll('option')].map((o) => o.textContent.trim())
            : [];
        }),
      { timeout: 10_000 },
    )
    .toContain('Tweet summary');
  timeline.markStep('tooltip');
  timeline.report();
});
