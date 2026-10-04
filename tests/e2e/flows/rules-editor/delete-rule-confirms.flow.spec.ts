/* coverage: templating.rules-editor.delete-rule-confirms */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

// The Undo toast action lives on `toastStore` and is covered by its own unit tests, so this spec only checks the rule is gone.

const SEED_ID = 'flow-delete-test-rule-001';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      rules: [
        {
          id: SEED_ID,
          body: 'Delete me — flow-test seed.',
          category: 'unknown',
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

test('Trash → Confirm removes the rule from storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-tasks').click();

  await expect(page.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });

  const pill = page.locator(`[data-ega-rule-pill][data-rule-id="${SEED_ID}"]`);
  await pill.locator('[data-ega-rule-pill-delete]').click();
  timeline.markStep('delete-clicked');

  // confirmDialog mounts an .ega-dialog with title "Delete rule".
  const dialog = page.locator('.ega-dialog', { hasText: 'Delete rule' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  timeline.markStep('confirmed');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return (s?.advanced.rules ?? []).some((r) => r.id === SEED_ID);
      },
      { timeout: 10_000 },
    )
    .toBe(false);
});
