/* coverage: integration.popup-sidepanel-handoff.popup-overlay-clamps-360 */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../../helpers';
import { createTimeline } from '../../_harness';

// The global popover CSS keys on body[data-ega-popup] to clamp overlays to the popup column.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('popup body sets data-ega-popup; root layout fits the 360px popup column', async () => {
  const timeline = createTimeline();
  const popup = await ext.context.newPage();
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.addInitScript(() => {
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  timeline.markStep('popup-open');

  await expect(popup.locator('body[data-ega-popup]')).toBeVisible({ timeout: 5_000 });
  const rect = await popup.locator('body').boundingBox();
  expect(rect).not.toBeNull();
  expect(rect?.width ?? 0).toBeLessThanOrEqual(360);
  timeline.markStep('clamp-asserted');
});
