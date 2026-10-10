import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  newestReply,
  readStorage,
  refineWithPreset,
  seedSettings,
  sendFromPanel,
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

test('sidepanel: the Refine button opens the presets from the keyboard, and Escape closes them', async () => {
  mockAnthropic(ext.context);
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sendFromPanel(page, 'hola amigo');

  // Refine shows once the reply stops loading.
  const refine = newestReply(page).locator('[data-ega-action="refine"]');
  await expect(refine).toBeVisible({ timeout: 10_000 });
  await expect(refine).toHaveAccessibleName('Refine');
  await refine.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(refine).toHaveAttribute('aria-expanded', 'true');
  // A keyboard open lands on the first preset.
  await expect(menu.locator('[data-ega-refine-preset="shorter"]')).toBeFocused();
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Shorter',
    'Less formal',
    'Keep slang',
    'Describe a change…',
    'Translate into another language…',
  ]);

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(refine).toBeFocused();
  await expect(refine).toHaveAttribute('aria-expanded', 'false');
});

test('sidepanel: Shorter refines in place without saving a rule', async () => {
  mockAnthropic(ext.context);
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sendFromPanel(page, 'hola amigo');

  await refineWithPreset(page, 'shorter');
  await expect(page.locator('[data-ega-variant-nav]')).toBeVisible({ timeout: 10_000 });

  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  // A fresh profile stores a partial blob with no `advanced`, which Settings does not admit.
  const stored = s as Partial<Settings> | undefined;
  expect(stored?.advanced?.rules ?? []).toEqual([]);

  const opt = await ext.context.newPage();
  try {
    await opt.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    await opt.locator('#tab-glossary').click();
    await expect(opt.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });
    await expect(opt.locator('[data-ega-rule-row]', { hasText: /shorter/i })).toHaveCount(0);
  } finally {
    await opt.close();
  }
});
