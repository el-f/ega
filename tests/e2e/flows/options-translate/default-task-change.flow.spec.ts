/* coverage: options.translate.default-task-change */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    defaultTask: 'translate',
    defaultTone: 'neutral',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('changing default task to Reword expands tone sub-section; tone change persists', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-translate').click();

  // Wait for TasksTonesSection.
  await expect(page.locator('[data-ega-setting="defaults.defaultTask"]')).toBeVisible({
    timeout: 5_000,
  });
  timeline.markStep('task-section-visible');

  // Tone sub-section must be collapsed when task = translate.
  await expect(page.locator('[data-ega-setting="defaults.defaultTone"]')).not.toBeVisible();

  // Select Reword.
  const taskSelect = page.locator('[data-ega-setting="defaults.defaultTask"] select');
  await taskSelect.selectOption('reword');
  timeline.markStep('reword-selected');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.defaultTask;
      },
      { timeout: 5_000 },
    )
    .toBe('reword');

  // CollapsibleField is now open — tone select must be visible.
  await expect(page.locator('[data-ega-setting="defaults.defaultTone"]')).toBeVisible({
    timeout: 3_000,
  });
  timeline.markStep('tone-section-expanded');

  // Change tone to formal.
  const toneSelect = page.locator('[data-ega-setting="defaults.defaultTone"] select');
  await toneSelect.selectOption('formal');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.defaultTone;
      },
      { timeout: 5_000 },
    )
    .toBe('formal');
  timeline.markStep('tone-persisted');
  timeline.report();
});
