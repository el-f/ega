/* coverage: templating.snippets.rename-snippet */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const FROM = 'flow_rename_from';
const TO = 'flow_rename_to';
const BODY = 'Bilingual mode preamble.';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      snippets: { [FROM]: BODY },
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

test('Edit name dialog migrates body to new key', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  await page.locator('[data-ega-workbench-chip="snippets"]').click();

  const row = page.locator(`[data-ega-snippet-row][data-ega-snippet-name="${FROM}"]`);
  await expect(row).toBeVisible({ timeout: 5_000 });
  await row.getByRole('button', { name: /Edit name/i }).click();
  timeline.markStep('rename-opened');

  const input = page.locator('[data-ega-snippet-rename-input]');
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.fill(TO);
  await input.press('Enter');
  timeline.markStep('renamed');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        const snip = s?.advanced.snippets ?? {};
        return Object.hasOwn(snip, TO) && !Object.hasOwn(snip, FROM) ? snip[TO] : null;
      },
      { timeout: 10_000 },
    )
    .toBe(BODY);
});
