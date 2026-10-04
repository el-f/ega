/* coverage: options.languages.prompt-inherits-global */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

const GLOBAL_SYS = 'GLOBAL_SYSTEM_BODY_UNIQUE_MARKER';

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: GLOBAL_SYS, user: 'usr {{text}}' },
      perPresetTemplates: {},
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('a language with no prompt of its own starts from the Translate prompt', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-languages').click();
  await page.getByLabel('Filter languages').fill('Arabizi');
  const row = page.locator('.variety-row', { has: page.locator('#enable-arabizi') });
  await row.getByRole('button', { name: 'Edit' }).click();
  await expect(row.locator('[data-ega-variety-prompt="arabizi"]')).toContainText(
    'Uses the Translate prompt',
  );
  await row.locator('[data-ega-variety-prompt-open="arabizi"]').click();
  timeline.markStep('editor-open');

  await expect(row.locator('[data-ega-template-system] textarea')).toHaveValue(GLOBAL_SYS, {
    timeout: 10_000,
  });
  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  expect(s?.advanced.perPresetTemplates).toEqual({});
  timeline.report();
});
