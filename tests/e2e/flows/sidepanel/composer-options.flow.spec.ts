/* coverage: translation.sidepanel.composer-options */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    contextEnabled: true,
    pageContextLevel: 'minimal',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Message options sets page info and live reply, and both are saved', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  const trigger = page.locator('[data-ega-composer-options]');
  await expect(trigger).toBeVisible({ timeout: 5_000 });
  timeline.markStep('sidepanel-opened');

  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Message options' });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  // The meaning is on screen, not in a hover tooltip.
  await expect(dialog.getByText('Page title and URL.')).toBeVisible();
  timeline.markStep('popover-open');

  await dialog.getByRole('button', { name: 'Rich' }).click();
  await expect(dialog.getByRole('button', { name: 'Rich' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog.getByText(/Also the page language/)).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Show the reply as it is written' }).uncheck();
  timeline.markStep('options-changed');

  await expect
    .poll(
      async () =>
        await page.evaluate(async () => {
          const r = await chrome.storage.local.get('ega.settings');
          const s = r['ega.settings'] as { pageContextLevel?: string; streaming?: boolean };
          return [s.pageContextLevel, s.streaming];
        }),
      { timeout: 5_000 },
    )
    .toEqual(['rich', false]);
  timeline.markStep('settings-saved');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  timeline.markStep('popover-closed');
});
