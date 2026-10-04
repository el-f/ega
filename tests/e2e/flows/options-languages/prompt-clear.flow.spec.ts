/* coverage: options.languages.prompt-clear */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  openLanguagePrompt,
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

test('Clear removes the language prompt, and the toast Undo puts it back', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openLanguagePrompt(page, 'arabizi', 'Arabizi');
  timeline.markStep('editor-open');

  await page.locator('[data-ega-variety-prompt="arabizi"] [data-ega-template-reset]').click();
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

  await page.locator('[data-sonner-toast] button', { hasText: 'Undo' }).first().click();
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
