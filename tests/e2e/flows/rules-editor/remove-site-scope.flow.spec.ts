/* coverage: templating.rules-editor.remove-site-scope */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const SEED_ID = 'flow-remove-site-scope-001';
const SEED_SITE = 'example.com';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      rules: [
        {
          id: SEED_ID,
          body: 'Site scope removal seed.',
          category: 'always',
          scope: { tasks: [], sites: [SEED_SITE] },
          source: 'manual',
          addedAt: new Date().toISOString(),
          enabled: true,
        },
      ],
      perPresetTemplates: {},
      temperature: 0.2,
      maxTokens: 2048,
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('clicking site scope chip removes example.com from scope.sites', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-tasks').click();

  await expect(page.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('rules-mounted');

  const row = page.locator(`[data-ega-rule-row][data-rule-id="${SEED_ID}"]`);
  await expect(row).toBeVisible({ timeout: 5_000 });

  const siteChip = row.locator(`[data-ega-rule-site-chip="${SEED_SITE}"]`);
  await expect(siteChip).toBeVisible({ timeout: 5_000 });
  timeline.markStep('site-chip-visible');

  await siteChip.click();
  timeline.markStep('site-chip-clicked');

  // removeSiteFromRule drops `sites` from scope when empty → key absent.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const rule = (s?.advanced.rules ?? []).find((r) => r.id === SEED_ID);
        return rule != null && !Object.hasOwn(rule.scope, 'sites');
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  timeline.markStep('site-removed');

  await expect(siteChip).not.toBeVisible({ timeout: 5_000 });
});
