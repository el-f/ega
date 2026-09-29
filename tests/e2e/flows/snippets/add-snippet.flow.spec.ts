/* coverage: templating.snippets.add-snippet */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

// `snippet1` is the name `nextDefaultName` picks for the first snippet.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('New snippet button seeds snippet1 in storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="snippets"]').click();
  await expect(page.locator('[data-ega-snippet-editor]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('snippets-mounted');

  await page.getByRole('button', { name: /\+ New snippet/i }).click();
  timeline.markStep('new-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return Object.hasOwn(s?.advanced.snippets ?? {}, 'snippet1');
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  timeline.markStep('persisted');

  await expect(
    page.locator('[data-ega-snippet-row][data-ega-snippet-name="snippet1"]'),
  ).toBeVisible({ timeout: 5_000 });
});
