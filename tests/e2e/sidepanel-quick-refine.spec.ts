import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  readStorage,
  seedSettings,
  type ExtensionHandle,
} from './helpers';
import type { Settings } from '../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    contextEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('sidepanel: quick-refine chips render below the result card after translate completes', async () => {
  mockAnthropic(ext.context);
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#sp-text').fill('hola amigo');
  await page.getByRole('button', { name: /^Translate$/ }).click();

  // The chip strip mounts only once the turn stops loading and has no error.
  const chipRow = page.locator('[data-ega-quick-refine]');
  await expect(chipRow).toBeVisible({ timeout: 10_000 });

  await expect(page.locator('[data-ega-refine-chip="shorter"]')).toBeVisible();
  await expect(page.locator('[data-ega-refine-chip="less-formal"]')).toBeVisible();
  await expect(page.locator('[data-ega-refine-chip="keep-slang"]')).toBeVisible();
  await expect(page.locator('[data-ega-refine-chip="refine"]')).toBeVisible();
});

test('sidepanel: clicking [Shorter] refines in place without persisting a rule', async () => {
  mockAnthropic(ext.context);
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#sp-text').fill('hola amigo');
  await page.getByRole('button', { name: /^Translate$/ }).click();

  await expect(page.locator('[data-ega-refine-chip="shorter"]')).toBeVisible({ timeout: 10_000 });
  await page.locator('[data-ega-refine-chip="shorter"]').click();

  await expect(page.locator('[data-ega-variant-nav]')).toBeVisible({ timeout: 10_000 });

  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  // A fresh profile stores a partial blob with no `advanced`, which Settings does not admit.
  const stored = s as Partial<Settings> | undefined;
  expect(stored?.advanced?.rules ?? []).toEqual([]);

  const opt = await ext.context.newPage();
  try {
    await opt.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    await opt.locator('button[data-tooltip="Templates"]').click();
    await opt.locator('[data-ega-workbench-chip="rules"]').click();
    await expect(opt.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });
    await expect(opt.locator('[data-ega-rule-row]', { hasText: /shorter/i })).toHaveCount(0);
  } finally {
    await opt.close();
  }
});
