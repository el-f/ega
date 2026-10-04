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

test('Power icon toggles enabled flag in storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-tasks').click();

  await expect(page.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });

  const pill = page.locator(`[data-ega-rule-pill][data-rule-id="${SEED_ID}"]`);
  await pill.locator('[data-ega-rule-pill-disable]').click();
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
});
