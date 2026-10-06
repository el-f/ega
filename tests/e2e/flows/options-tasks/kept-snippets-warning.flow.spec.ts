/* coverage: options.tasks.kept-snippets-warning */
import { test, expect } from '@playwright/test';
import { launchExtension, openTaskPrompt, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

// Written out, this system prompt is 16,384 characters: past the 16,000 cap, so the snippets stay.
const BIG = 'x'.repeat(8192);

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: '@@big@@@@big@@', user: '{{text}}' },
      snippets: { big: BIG },
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('a prompt too long to write its snippets into keeps them and says so', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await openTaskPrompt(page, 'translate');
  timeline.markStep('editor-open');

  await expect(page.locator('[data-ega-snippet-warn]')).toContainText(
    'longer than 16,000 characters',
  );
  timeline.markStep('warned');
  timeline.report();
});
