/* coverage: options.languages.prompt-clear */
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

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      perPresetTemplates: {
        arabizi: { system: 'Custom arabizi system.', user: 'Custom arabizi user: {{text}}' },
      },
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Use the Translate prompt removes the language prompt, and Undo in the dialog puts it back', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  const dialog = await openLanguageDialog(page, 'arabizi', 'Arabizi');
  await expect(dialog.getByRole('radio', { name: 'Use its own prompt' })).toBeChecked();
  timeline.markStep('editor-open');

  await dialog.getByRole('radio', { name: 'Use the Translate prompt' }).click();
  timeline.markStep('cleared');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return Object.hasOwn(s?.advanced.perPresetTemplates ?? {}, 'arabizi');
      },
      { timeout: 10_000 },
    )
    .toBe(false);
  timeline.markStep('stored-cleared');

  await page.locator('[data-ega-dialog-undo]').click();
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.perPresetTemplates['arabizi'];
      },
      { timeout: 10_000 },
    )
    .toEqual({ system: 'Custom arabizi system.', user: 'Custom arabizi user: {{text}}' });
  timeline.markStep('undo-restored');
  timeline.report();
});
