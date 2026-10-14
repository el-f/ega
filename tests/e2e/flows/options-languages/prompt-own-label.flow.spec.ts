/* coverage: options.languages.prompt-own-label */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  openLanguageDialog,
  seedSettings,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      perPresetTemplates: {
        arabizi: { system: 'Arabizi override sys.', user: 'Arabizi override user {{text}}' },
      },
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('a language with its own prompt opens on "Use its own prompt"; one without on the Translate prompt', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  for (const [id, label, mode] of [
    ['arabizi', 'Arabizi', 'Use its own prompt'],
    ['elvish-quenya', 'Elvish (Quenya)', 'Use the Translate prompt'],
  ] as const) {
    const dialog = await openLanguageDialog(page, id, label);
    await expect(dialog.getByRole('radio', { name: mode })).toBeChecked();
    await expect(dialog.locator('[data-ega-prompt-editor]')).toHaveCount(
      mode === 'Use its own prompt' ? 1 : 0,
    );
    await page.locator('[data-ega-dialog-done]').click();
    await expect(dialog).toHaveCount(0);
  }
  timeline.markStep('labels-checked');
  timeline.report();
});
