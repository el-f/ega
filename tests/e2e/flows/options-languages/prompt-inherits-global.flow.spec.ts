/* coverage: options.languages.prompt-inherits-global */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  openLanguageDialog,
  readStorage,
  seedSettings,
  type ExtensionHandle,
} from '../../helpers';
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
  const dialog = await openLanguageDialog(page, 'arabizi', 'Arabizi');
  await expect(dialog.getByRole('radio', { name: 'Use the Translate prompt' })).toBeChecked();
  await dialog.getByRole('radio', { name: 'Use its own prompt' }).click();
  timeline.markStep('editor-open');

  await expect(dialog.locator('[data-ega-template-system] textarea')).toHaveValue(GLOBAL_SYS, {
    timeout: 10_000,
  });
  // Choosing it stores nothing until a half differs from the Translate prompt.
  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  expect(s?.advanced.perPresetTemplates).toEqual({});
  timeline.report();
});
