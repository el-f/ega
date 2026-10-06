/* coverage: options.backends.install-info-tooltip */
import { test, expect } from '@playwright/test';
import { launchExtension, onlyBackends, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  // Enable native so its card sits at a stable position at the top of the list.
  await seedSettings(ext.context, ext.extensionId, {
    ...onlyBackends('native'),
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('the (i) on the native card explains the install in two sentences', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-backends').click();

  const card = page.locator('details[data-backend-id="native"]');
  await expect(card).toBeVisible({ timeout: 5_000 });
  // Status row + (i) live inside the body — open the details.
  if (!(await card.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await card.locator('summary').first().click();
  }
  timeline.markStep('card-open');

  // A real button: it takes focus and has a name.
  const info = card.getByRole('button', { name: 'About the native host install' });
  await expect(info).toBeVisible({ timeout: 5_000 });
  const bubble = page.locator('[data-ega-infotip-text]');
  await info.focus();
  await expect(bubble).toContainText('Node.js 20 or later');
  await expect(bubble).toContainText('uninstall removes the helper');
  timeline.markStep('tooltip-open');

  await page.keyboard.press('Escape');
  await expect(bubble).toBeHidden();
  await info.click();
  await expect(bubble).toBeVisible();
});
