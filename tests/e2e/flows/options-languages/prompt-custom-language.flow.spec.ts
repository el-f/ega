/* coverage: options.languages.prompt-custom-language */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  openLanguagePrompt,
  readStorage,
  type ExtensionHandle,
} from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const CUSTOM_ID = 'e2e-testlang-custom';
const CUSTOM_LABEL = 'E2E TestLang';
const MARKER = '/* EGA-CUSTOM-VARIETY-PRESET-SAVE */ ';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  const page = await ext.context.newPage();
  try {
    await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    await page.evaluate(
      async ({ id, label, createdAt }: { id: string; label: string; createdAt: number }) => {
        const entry = { id, label, hint: 'A test custom variety.', examples: [], createdAt };
        await chrome.storage.local.set({ 'ega.customLanguages': [entry] });
      },
      { id: CUSTOM_ID, label: CUSTOM_LABEL, createdAt: Date.now() },
    );
  } finally {
    await page.close();
  }
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('a custom language can have its own prompt too', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  const dialog = await openLanguagePrompt(page, CUSTOM_ID, CUSTOM_LABEL);
  timeline.markStep('editor-open');

  await dialog.locator('[data-ega-template-system] textarea').fill(`${MARKER}custom`);
  await page.locator('[data-ega-dialog-done]').click();
  timeline.markStep('saved');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.perPresetTemplates[CUSTOM_ID]?.system ?? '';
      },
      { timeout: 10_000 },
    )
    .toBe(`${MARKER}custom`);
  timeline.report();
});
