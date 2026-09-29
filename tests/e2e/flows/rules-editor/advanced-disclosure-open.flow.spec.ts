/* coverage: templating.rules-editor.advanced-disclosure-open */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

const SEED_ID = 'flow-advanced-disclosure-seed-001';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      rules: [
        {
          id: SEED_ID,
          body: 'Always preserve URLs verbatim.',
          category: 'always',
          scope: { tasks: [] },
          source: 'manual',
          addedAt: new Date().toISOString(),
          enabled: true,
        },
      ],
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

test('Advanced rules disclosure mounts manual form + row editor on open', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="rules"]').click();
  await expect(page.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('rules-mounted');

  // `<details>` keeps its children in the DOM when closed, so assert visibility, not presence.
  await expect(page.locator(`[data-ega-rule-row][data-rule-id="${SEED_ID}"]`)).not.toBeVisible();
  await expect(page.locator('details.manual-block')).not.toBeVisible();

  await page.locator('[data-ega-advanced-rules] > summary').click();
  timeline.markStep('advanced-open');

  await expect(page.locator(`[data-ega-rule-row][data-rule-id="${SEED_ID}"]`)).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.locator('details.manual-block')).toBeVisible({ timeout: 5_000 });
});
