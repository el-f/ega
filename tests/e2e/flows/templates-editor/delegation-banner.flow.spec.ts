/* coverage: templating.templates-editor.delegation-banner */
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

test('jump button on delegation banner lands user on Global chip with editor mounted', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('advanced-open');

  await expect(page.locator('[data-ega-workbench-chip="global"]')).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 5_000 },
  );

  // Explain is the second delegating chip, so it also pins the banner copy.
  await page.locator('[data-ega-workbench-chip="explain"]').click();
  timeline.markStep('explain-chip-clicked');

  const banner = page.locator('[data-ega-delegation-banner][data-ega-delegation-task="explain"]');
  await expect(banner).toBeVisible({ timeout: 5_000 });
  await expect(banner.locator('.delegation-chip')).toHaveText('Delegates to Global');

  // The preview disclosure shows the resolved global template.
  await banner.locator('summary').click();
  await expect(banner.locator('.delegation-preview-body pre').first()).toBeVisible();
  timeline.markStep('preview-opened');

  await banner.locator('[data-ega-delegation-jump]').click();
  timeline.markStep('jump-clicked');

  await expect(page.locator('[data-ega-workbench-chip="global"]')).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 5_000 },
  );
  await expect(page.locator('[data-ega-template-editor]')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-ega-delegation-banner]')).toHaveCount(0);
  timeline.markStep('global-editor-mounted');
});
