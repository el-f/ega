/* coverage: options.languages.prompt-own-label */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
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

test('a language with its own prompt says so; one without says it uses the Translate prompt', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-languages').click();
  for (const [id, label, text] of [
    ['arabizi', 'Arabizi', 'This language has its own prompt'],
    ['elvish-quenya', 'Quenya', 'Uses the Translate prompt'],
  ] as const) {
    await page.getByLabel('Filter languages').fill(label);
    const row = page.locator('.variety-row', { has: page.locator(`#enable-${id}`) });
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(row.locator(`[data-ega-variety-prompt="${id}"]`)).toContainText(text);
    await expect(row.locator(`[data-ega-variety-prompt-open="${id}"]`)).toHaveText(
      id === 'arabizi' ? 'Edit prompt' : 'Write a prompt',
    );
    await row.getByRole('button', { name: 'Close editor' }).click();
  }
  timeline.markStep('labels-checked');
  timeline.report();
});
