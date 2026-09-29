/* coverage: templating.snippets.body-at-max-length-truncates */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const SNIP_NAME = 'flow_body_max';
const BODY_MAX = 8192;

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      snippets: { [SNIP_NAME]: '' },
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

test('typing 8193 chars into snippet body persists only first 8192 (BODY_MAX)', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  await page.locator('[data-ega-workbench-chip="snippets"]').click();

  const row = page.locator(`[data-ega-snippet-row][data-ega-snippet-name="${SNIP_NAME}"]`);
  await expect(row).toBeVisible({ timeout: 5_000 });
  timeline.markStep('snippet-row-visible');

  const textarea = row.locator('[data-ega-snippet-body]');
  await expect(textarea).toBeVisible({ timeout: 5_000 });

  // 8193 chars — one over the limit.
  const overLimitText = 'A'.repeat(BODY_MAX + 1);
  await textarea.fill(overLimitText);
  timeline.markStep('text-filled');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.snippets[SNIP_NAME]?.length ?? 0;
      },
      { timeout: 10_000 },
    )
    .toBe(BODY_MAX);
  timeline.markStep('storage-capped');
});
