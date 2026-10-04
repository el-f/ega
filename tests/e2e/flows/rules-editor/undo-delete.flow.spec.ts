/* coverage: templating.rules-editor.undo-delete */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const ID_A = 'flow-undo-delete-A-001';
const ID_B = 'flow-undo-delete-B-001';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      rules: [
        {
          id: ID_A,
          body: 'Rule A — undo-delete seed.',
          category: 'always',
          scope: { tasks: [] },
          source: 'manual',
          addedAt: new Date().toISOString(),
          enabled: true,
        },
        {
          id: ID_B,
          body: 'Rule B — undo-delete seed.',
          category: 'never',
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

test('delete rule A → Undo toast → click Undo → A re-inserted, B still present', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-tasks').click();

  await expect(page.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('rules-mounted');

  const rowA = page.locator(`[data-ega-rule-row][data-rule-id="${ID_A}"]`);
  await expect(rowA).toBeVisible({ timeout: 5_000 });
  await rowA.locator('[data-ega-rule-delete]').click();
  timeline.markStep('delete-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return (s?.advanced.rules ?? []).some((r) => r.id === ID_A);
      },
      { timeout: 10_000 },
    )
    .toBe(false);
  timeline.markStep('rule-a-deleted');

  const undoBtn = page.locator('[data-sonner-toast] button', { hasText: 'Undo' }).first();
  await expect(undoBtn).toBeVisible({ timeout: 10_000 });
  timeline.markStep('undo-toast-visible');

  await undoBtn.click();
  timeline.markStep('undo-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return (s?.advanced.rules ?? []).some((r) => r.id === ID_A);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  timeline.markStep('rule-a-restored');
});
