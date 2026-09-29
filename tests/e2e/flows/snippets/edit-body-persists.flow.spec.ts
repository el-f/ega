/* coverage: templating.snippets.edit-body-persists */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const SEED_NAME = 'snippet1';
const TYPED = 'Always preserve the original line in @@bilingual@@ mode.';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      snippets: { [SEED_NAME]: '' },
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

test('typing into the body textarea persists per-keystroke to storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  await page.locator('[data-ega-workbench-chip="snippets"]').click();

  const row = page.locator(`[data-ega-snippet-row][data-ega-snippet-name="${SEED_NAME}"]`);
  await expect(row).toBeVisible({ timeout: 5_000 });
  const body = row.locator('[data-ega-snippet-body]');
  await body.fill(TYPED);
  timeline.markStep('typed');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.snippets[SEED_NAME] ?? '';
      },
      { timeout: 10_000 },
    )
    .toBe(TYPED);
});
