/* coverage: templating.rules-editor.toggle-enabled */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const SEED_ID = 'flow-toggle-test-rule-001';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      rules: [
        {
          id: SEED_ID,
          body: 'Toggle test seed.',
          category: 'always',
          scope: { tasks: [] },
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

test('the On checkbox toggles the enabled flag in storage and shows Off', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-tasks').click();

  await expect(page.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });

  const row = page.locator(`[data-ega-rule-row][data-rule-id="${SEED_ID}"]`);
  await expect(row.locator('[data-ega-rule-off]')).toHaveCount(0);
  await row.locator('[data-ega-rule-disable]').click();
  timeline.markStep('toggle-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.rules.find((r) => r.id === SEED_ID)?.enabled;
      },
      { timeout: 10_000 },
    )
    .toBe(false);
  await expect(row.locator('[data-ega-rule-off]')).toBeVisible();
});
