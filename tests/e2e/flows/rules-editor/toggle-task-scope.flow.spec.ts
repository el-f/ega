/* coverage: templating.rules-editor.toggle-task-scope */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const SEED_ID = 'flow-toggle-scope-001';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      rules: [
        {
          id: SEED_ID,
          body: 'Scope toggle test seed.',
          category: 'always',
          scope: { tasks: ['translate'] },
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

test('turning the last task off turns All tasks back on, with no error toast', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-glossary').click();

  await expect(page.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('rules-mounted');

  const row = page.locator(`[data-ega-rule-row][data-rule-id="${SEED_ID}"]`);
  await expect(row).toBeVisible({ timeout: 5_000 });

  await row.locator('[data-ega-rule-edit]').click();
  const translate = row.locator('[data-ega-rule-scope-task="translate"]');
  const all = row.locator('[data-ega-rule-scope-all]');
  await expect(translate).toHaveAttribute('aria-pressed', 'true');
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  timeline.markStep('chip-visible');

  await translate.click();
  timeline.markStep('all-tasks-picked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const rule = (s?.advanced.rules ?? []).find((r) => r.id === SEED_ID);
        return rule?.scope.tasks.length ?? -1;
      },
      { timeout: 10_000 },
    )
    .toBe(0);
  timeline.markStep('tasks-empty');

  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(row.locator('[data-ega-rule-meta]')).toContainText('All tasks');
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  timeline.markStep('all-tasks-visible');
});
