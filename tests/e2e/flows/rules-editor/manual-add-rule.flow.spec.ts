/* coverage: templating.rules-editor.manual-add-rule */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const BODY = 'Always preserve URLs verbatim. (flow-test seed)';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Add rule opens a draft that saves a rule with source=manual to storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-glossary').click();

  await expect(page.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-ega-rules-empty]')).toContainText('No rules yet');
  timeline.markStep('rules-mounted');

  // While empty, the empty state holds the only Add rule.
  await expect(page.locator('[data-ega-rules-add]')).toHaveCount(0);
  await page.locator('[data-ega-rules-empty]').getByRole('button', { name: 'Add rule' }).click();
  await expect(page.locator('[data-ega-rule-draft]')).toBeVisible();
  await expect(page.locator('[data-ega-manual-body]')).toBeFocused();
  await page.locator('[data-ega-manual-body]').fill(BODY);
  await page.locator('[data-ega-manual-submit]').click();
  timeline.markStep('submitted');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return (s?.advanced.rules ?? []).some((r) => r.source === 'manual' && r.body === BODY);
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  await expect(page.locator('[data-ega-rules-empty]')).toHaveCount(0);
  await expect(page.locator('[data-ega-rule-draft]')).toHaveCount(0);
  await expect(page.locator('[data-ega-rules-add]')).toBeVisible();
  timeline.markStep('persisted');

  // detectCategory keys on `Always …` → category='always'.
  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  const seeded = s?.advanced.rules.find((r) => r.body === BODY);
  expect(seeded?.category).toBe('always');
});
