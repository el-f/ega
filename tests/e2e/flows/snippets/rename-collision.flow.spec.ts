/* coverage: templating.snippets.rename-collision */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline, assertStaysStable } from '../_harness';

const SNIP_A = 'snip_a';
const SNIP_B = 'snip_b';
const BODY_A = 'Body of snippet A.';
const BODY_B = 'Body of snippet B.';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      snippets: { [SNIP_A]: BODY_A, [SNIP_B]: BODY_B },
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

test('rename collision shows "That name is already in use." error and leaves storage unchanged', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  await page.locator('[data-ega-workbench-chip="snippets"]').click();

  const rowA = page.locator(`[data-ega-snippet-row][data-ega-snippet-name="${SNIP_A}"]`);
  await expect(rowA).toBeVisible({ timeout: 5_000 });
  await rowA.getByRole('button', { name: /Edit name/i }).click();
  timeline.markStep('rename-dialog-opened');

  const input = page.locator('[data-ega-snippet-rename-input]');
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.fill(SNIP_B);
  await page.getByRole('button', { name: /^Rename$/i }).click();
  timeline.markStep('rename-submitted');

  // Error message must appear.
  const errMsg = page.locator('.dialog-error', { hasText: /That name is already in use\./i });
  await expect(errMsg).toBeVisible({ timeout: 5_000 });
  timeline.markStep('error-visible');

  // Dialog must still be open.
  await expect(page.locator('[data-ega-snippet-rename-input]')).toBeVisible({ timeout: 3_000 });

  // Storage must be unchanged — both keys present, bodies intact.
  await assertStaysStable(
    async () => {
      const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
      const snips = s?.advanced.snippets ?? {};
      return (
        Object.hasOwn(snips, SNIP_A) &&
        Object.hasOwn(snips, SNIP_B) &&
        snips[SNIP_A] === BODY_A &&
        snips[SNIP_B] === BODY_B
      );
    },
    true,
    { windowMs: 1_000, message: 'Storage must not be mutated on collision error' },
  );
  timeline.markStep('storage-unchanged');
});
