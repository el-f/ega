/* coverage: options.backends.reorder-keyboard */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  onlyBackends,
  readStorage,
  seedSettings,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';
import type { Settings } from '../../../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  // Seed a known order: anthropic first, openai second.
  // Only anthropic is active so the gutter for anthropic shows position 1.
  await seedSettings(ext.context, ext.extensionId, {
    ...onlyBackends('anthropic'),
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Alt+ArrowDown on active backend gutter moves it one slot down in backendOrder', async () => {
  const timeline = createTimeline();

  // Enable both anthropic and openai in the active zone so there are two rows to swap.
  await seedSettings(ext.context, ext.extensionId, {
    ...onlyBackends('anthropic', 'openai'),
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-backends').click();

  // Wait for active list and both rows.
  const activeList = page.getByTestId('be-list-active');
  await expect(activeList).toBeVisible({ timeout: 5_000 });
  await expect(activeList.getByTestId('be-row-anthropic')).toBeVisible({ timeout: 5_000 });
  await expect(activeList.getByTestId('be-row-openai')).toBeVisible({ timeout: 3_000 });
  timeline.markStep('rows-visible');

  // Focus the gutter handle on the anthropic row.
  // The gutter is role="button" with aria-label "Reorder anthropic …".
  const anthropicGutter = activeList
    .getByTestId('be-row-anthropic')
    .getByRole('button', { name: /Reorder anthropic/i });
  await expect(anthropicGutter).toBeVisible({ timeout: 3_000 });
  await anthropicGutter.focus();
  timeline.markStep('gutter-focused');

  // Alt+ArrowDown triggers onGutterKeydown → reorderById('anthropic', 1).
  await page.keyboard.press('Alt+ArrowDown');
  timeline.markStep('key-pressed');

  // backendOrder in storage should now have openai before anthropic.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const order = s?.backendOrder ?? [];
        const ai = order.indexOf('anthropic' as Settings['backendOrder'][number]);
        const oi = order.indexOf('openai' as Settings['backendOrder'][number]);
        return oi < ai;
      },
      { timeout: 5_000 },
    )
    .toBe(true);

  timeline.markStep('order-updated');
  timeline.report();
});
