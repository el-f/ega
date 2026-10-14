/* coverage: options.tasks.required-missing-flag */
import { test, expect } from '@playwright/test';
import { launchExtension, openTaskPrompt, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: {
        system: 'You are a translator. {{nope}}',
        // {{text}} is dropped on purpose — that is what raises the required-missing flag.
        user: 'Translate the source. Target: {{targetLangLabel}}.',
      },
      perPresetTemplates: {},
      temperature: 0.2,
      maxTokens: 2048,
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('the editor names a Message without the selected text, and a name that is not a variable', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openTaskPrompt(page, 'translate');
  timeline.markStep('editor-open');

  await expect(page.locator('[data-ega-prompt-error]')).toHaveText(
    'The message needs the Selected text variable. Add it with Insert variable.',
  );
  await expect(page.locator('[data-ega-template-user] textarea')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  // An unknown variable renders empty, and the editor says so.
  await expect(page.locator('[data-ega-slot-warn]').first()).toContainText(
    '{{nope}} is not a variable, so it will be empty',
  );
  timeline.markStep('flags-visible');
});
