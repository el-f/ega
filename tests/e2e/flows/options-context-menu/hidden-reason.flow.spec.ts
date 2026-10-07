/* coverage: options.context-menu.hidden-reason */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('a right-click row whose task is off says why Chrome leaves it out', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-tasks').click();
  await page.locator('[data-ega-task-toggle="explain"]').uncheck();
  await expect
    .poll(
      async () =>
        (await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings'))?.disabledTasks,
      { timeout: 5_000 },
    )
    .toEqual(['explain']);
  timeline.markStep('explain-off');

  await page.locator('#tab-selection-bubble').click();
  const row = page.locator('[data-ega-cm-id="ega-explain-image"]');
  const status = row.locator('[data-ega-cm-status]');
  await expect(status).toHaveText('Hidden: Explain is off in Tasks', { timeout: 5_000 });
  // The name ends with the reason, so it is read even where descriptions are not.
  const box = row.getByRole('checkbox', {
    name: 'Explain image in side panel, show in menu. Hidden: Explain is off in Tasks',
  });
  // Still focusable, so the reason is read; the click changes nothing.
  await expect(box).toHaveAttribute('aria-disabled', 'true');
  await expect(box).toHaveAccessibleDescription('Hidden: Explain is off in Tasks');
  // A real click; Playwright refuses aria-disabled targets without force.
  await box.click({ force: true });
  await expect(box).toBeChecked();
  timeline.markStep('reason-shown');
  timeline.report();
});
