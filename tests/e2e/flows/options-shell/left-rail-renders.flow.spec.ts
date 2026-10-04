/* coverage: options.shell.left-rail-renders */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

const EXPECTED_TABS = [
  'translate',
  'selection-bubble',
  'backends',
  'languages',
  'tasks',
  'advanced',
  'about',
];

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('left rail renders every tab + both group headings', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  timeline.markStep('opened');

  await expect(page.locator('nav.options-nav')).toBeVisible({ timeout: 5_000 });

  for (const id of EXPECTED_TABS) {
    await expect(page.locator(`#tab-${id}`)).toBeVisible({ timeout: 2_000 });
  }
  timeline.markStep('tabs-visible');

  // The @container query hides these labels at <=880px; the test viewport is 1200x800.
  await expect(page.locator('#options-nav-group-configuration')).toBeVisible();
  await expect(page.locator('#options-nav-group-system')).toBeVisible();
});
