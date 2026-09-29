/* coverage: options.shell.keyboard-tab-nav */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('ArrowDown + Home + End + Alt+digit walk the tablist', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  await page.locator('#tab-translate').focus();
  timeline.markStep('focused');

  // No re-focus between presses: focus must stay on the rail tab, or arrow navigation dies after one press.
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#tab-selection-bubble')).toHaveAttribute('aria-selected', 'true', {
    timeout: 2_000,
  });
  await expect(page.locator('#tab-selection-bubble')).toBeFocused({ timeout: 2_000 });

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#tab-backends')).toHaveAttribute('aria-selected', 'true', {
    timeout: 2_000,
  });
  await expect(page.locator('#tab-backends')).toBeFocused({ timeout: 2_000 });

  await page.keyboard.press('End');
  await expect(page.locator('#tab-about')).toHaveAttribute('aria-selected', 'true', {
    timeout: 2_000,
  });

  await page.keyboard.press('Home');
  await expect(page.locator('#tab-translate')).toHaveAttribute('aria-selected', 'true', {
    timeout: 2_000,
  });

  // Alt+3 jumps to the third tab; the handler listens on document, not on the tablist.
  await page.keyboard.press('Alt+3');
  await expect(page.locator('#tab-backends')).toHaveAttribute('aria-selected', 'true', {
    timeout: 2_000,
  });
  timeline.markStep('alt-3-pressed');
});
