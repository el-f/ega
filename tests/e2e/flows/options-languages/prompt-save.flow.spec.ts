/* coverage: options.languages.prompt-save */
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

const MARKER = '/* EGA-TEST-PER-PRESET-SAVE */ ';

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: { promptTemplate: { system: 'sys', user: 'usr {{text}}' }, perPresetTemplates: {} },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Use its own prompt stores the changed half in perPresetTemplates', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  const dialog = await openLanguagePrompt(page, 'arabizi', 'Arabizi');
  timeline.markStep('editor-open');

  await dialog.locator('[data-ega-template-system] textarea').fill(`${MARKER}Arabizi only.`);
  await page.locator('[data-ega-dialog-done]').click();
  timeline.markStep('saved');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.perPresetTemplates['arabizi']?.system ?? '';
      },
      { timeout: 10_000 },
    )
    .toBe(`${MARKER}Arabizi only.`);
  timeline.report();
});
