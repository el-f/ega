import { test, expect, type Page } from '@playwright/test';
import {
  launchExtension,
  openTaskPrompt,
  readStorage,
  seedSettings,
  type ExtensionHandle,
} from './helpers';
import { CURRENT_TEMPLATE_VERSION } from '../../src/shared/settings-schema';
import type { Settings } from '../../src/shared/types';
import { DEFAULT_SETTINGS } from '../../src/shared/settings-defaults';

// V2 IA: Advanced holds three sub-tabs (Diagnostics / Data / Labs); the Translate prompt lives in the Translate task dialog.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

async function openAdvanced(): Promise<Page> {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Advanced"]').click();
  return page;
}

async function openTranslatePrompt(): Promise<Page> {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openTaskPrompt(page, 'translate');
  return page;
}

async function selectSubTab(page: Page, id: string): Promise<void> {
  await page.locator(`[data-ega-subtab="${id}"]`).click();
}

test('Advanced: 3 sub-tabs render at top', async () => {
  const page = await openAdvanced();
  for (const id of ['diagnostics', 'data', 'labs']) {
    await expect(page.locator(`[data-ega-subtab="${id}"]`)).toBeVisible({ timeout: 5_000 });
  }
});

test('Advanced: default sub-tab is Diagnostics', async () => {
  const page = await openAdvanced();
  const diagBtn = page.locator('[data-ega-subtab="diagnostics"]');
  await expect(diagBtn).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 });
});

test('Advanced: clicking Diagnostics shows the debug section', async () => {
  const page = await openAdvanced();
  await selectSubTab(page, 'diagnostics');
  await expect(page.locator('[data-ega-debug-section]')).toBeVisible({ timeout: 5_000 });
});

test('Advanced: clicking Data shows the reset button', async () => {
  const page = await openAdvanced();
  await selectSubTab(page, 'data');
  await expect(page.locator('[data-ega-reset-defaults]')).toBeVisible({ timeout: 5_000 });
});

test('Reset to defaults restores temperature + maxTokens to shipped values', async () => {
  const page = await openAdvanced();

  // Seed via storage — bits-ui paints Slider without an <input>, so UI-level mutation is fragile.
  await page.evaluate(async () => {
    const cur = await chrome.storage.local.get('ega.settings');
    const s = (cur['ega.settings'] as { advanced?: Record<string, unknown> } | undefined) ?? {};
    const adv = (s.advanced as Record<string, unknown> | undefined) ?? {};
    const merged = {
      ...s,
      advanced: { ...adv, temperature: 1.9, maxTokens: 64 },
    };
    await chrome.storage.local.set({ 'ega.settings': merged });
  });

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.temperature;
      },
      { timeout: 4_000 },
    )
    .toBe(1.9);

  await selectSubTab(page, 'data');
  await page.locator('[data-ega-reset-defaults]').click();
  const dialog = page.locator('.ega-dialog', { hasText: 'Reset prompt and generation settings' });
  await expect(dialog).toBeVisible();
  await dialog.locator('#confirm-input').fill('RESET');
  await dialog.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.temperature;
      },
      { timeout: 4_000 },
    )
    .toBe(DEFAULT_SETTINGS.advanced.temperature);
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.maxTokens;
      },
      { timeout: 4_000 },
    )
    .toBe(DEFAULT_SETTINGS.advanced.maxTokens);
});

test('Translate prompt: template-version banner is hidden on a fresh install', async () => {
  const page = await openTranslatePrompt();
  await expect(page.locator('[data-ega-tpl-version-banner]')).toHaveCount(0);
});

test('Advanced: template-version banner Keep-mine flow when seeded older', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: {
        system: 'CUSTOM SYSTEM (does not match legacy sentinel) — banner-test seed',
        user: 'CUSTOM USER {{text}}',
      },
      perPresetTemplates: {},
      temperature: 0.2,
      maxTokens: 2048,
      templateVersion: 0,
    },
  });
  const page = await openTranslatePrompt();
  const banner = page.locator('[data-ega-tpl-version-banner]');
  await expect(banner).toBeVisible({ timeout: 5_000 });

  await page.locator('[data-ega-tpl-keep-mine]').click();
  await expect(banner).toHaveCount(0, { timeout: 5_000 });
  await expect
    .poll(async () => {
      const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
      return s?.advanced.templateVersionAcknowledged;
    })
    .toBe(CURRENT_TEMPLATE_VERSION);
});

test('Advanced: BackupRestoreCard renders the Export all settings button at Data sub-tab', async () => {
  const page = await openAdvanced();
  await selectSubTab(page, 'data');
  const exportAll = page.locator('[data-ega-export-all]');
  await expect(exportAll).toBeVisible({ timeout: 5_000 });
  await expect(exportAll).toHaveText('Export all settings');
});

test('Advanced: Cmd/Ctrl+, opens the SettingsSearch modal', async () => {
  const page = await openAdvanced();
  await page.keyboard.press('Control+,');
  const search = page.getByRole('combobox', { name: /Search settings/i });
  await expect(search).toBeVisible({ timeout: 5_000 });
});

test('Advanced: SettingsSearch deep-link to cache/settings lands on Translate tab (V2 IA)', async () => {
  const page = await openAdvanced();
  await page.keyboard.press('Control+,');
  const input = page.getByPlaceholder(/Search settings/i);
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.fill('cache settings');

  const list = page.getByRole('listbox', { name: /Settings results/i });
  await expect(list).toBeVisible();
  // advanced.cacheSettings deep-links to the top-level Translate tab, where the Streaming and cache card lives.
  const cacheOption = list
    .getByRole('option')
    .filter({ hasText: /^.*Cache settings/i })
    .first();
  await cacheOption.click();

  await expect(page.locator('button[data-tooltip="Translate"]')).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 5_000 },
  );
});
