/* coverage: templating.snippets.delete-snippet */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const SEED_NAME = 'flow_delete_snippet';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      snippets: { [SEED_NAME]: 'Delete me.' },
      perPresetTemplates: {},
      taskTemplates: {},
      temperature: 0.2,
      maxTokens: 2048,
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Delete confirms and removes the snippet from storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  await page.locator('[data-ega-workbench-chip="snippets"]').click();

  const row = page.locator(`[data-ega-snippet-row][data-ega-snippet-name="${SEED_NAME}"]`);
  await expect(row).toBeVisible({ timeout: 5_000 });
  await row.getByRole('button', { name: /^Delete$/ }).click();
  timeline.markStep('delete-clicked');

  const dialog = page.locator('.ega-dialog', { hasText: 'Delete snippet' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  timeline.markStep('confirmed');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return Object.hasOwn(s?.advanced.snippets ?? {}, SEED_NAME);
      },
      { timeout: 10_000 },
    )
    .toBe(false);
});
