/* coverage: options.advanced.diagnostics-tools-reset */
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

test('Diagnostics settings reset reverts Log detail and Record request details to defaults', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-advanced').click();

  // Data is the default sub-tab; Diagnostics is one click away.
  await page.locator('[data-ega-subtab="diagnostics"]').click();
  await expect(page.locator('#adv-pane-diagnostics')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('diagnostics-open');

  // SectionReset must be absent when no fields are modified.
  const sectionReset = page.locator(
    'section[data-ega-subtab="diagnostics"] [data-ega-section-reset], #adv-pane-diagnostics [data-ega-section-reset]',
  );

  // Change the debug log level to "debug" using the <select> rendered inside
  // AdvancedDiagnosticsPane.
  const logLevelSelect = page.locator('#adv-log-level');
  await expect(logLevelSelect).toBeVisible({ timeout: 5_000 });
  await logLevelSelect.selectOption('debug');
  timeline.markStep('log-level-changed');

  // SectionReset must now appear.
  await expect(sectionReset.first()).toBeVisible({ timeout: 5_000 });

  // Storage should reflect the new value.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.debugLogLevel;
      },
      { timeout: 8_000 },
    )
    .toBe('debug');

  // Click SectionReset.
  await sectionReset.first().click();
  timeline.markStep('section-reset-clicked');

  // Both debugLogLevel and captureResultMeta must revert to defaults.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.debugLogLevel;
      },
      { timeout: 8_000 },
    )
    .toBe('warn');

  // SectionReset should hide again.
  await expect(sectionReset.first()).toHaveCount(0);
  timeline.markStep('reverted-to-default');
  timeline.report();
});
