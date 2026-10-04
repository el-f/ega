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

test('Save in a language prompt stores perPresetTemplates for that language', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openLanguagePrompt(page, 'arabizi', 'Arabizi');
  timeline.markStep('editor-open');

  const sys = page.locator(
    '[data-ega-variety-prompt="arabizi"] [data-ega-template-system] textarea',
  );
  await sys.fill(`${MARKER}Arabizi only.`);
  await page.locator('[data-ega-variety-prompt="arabizi"] [data-ega-template-save]').click();
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
