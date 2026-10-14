/* coverage: translation.sidepanel.multi-variety-cluster */
import { test, expect } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('multi-variety detection names every variety in the reply meta line', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, {
    translation: 'Good morning, everyone',
    detectedLangs: [
      { id: 'arabizi', detail: 'Levantine' },
      { id: 'en', detail: 'English' },
    ],
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').fill('sabah el kheir everyone');
  await page.locator('#sp-text').press('Enter');
  timeline.markStep('send-clicked');

  const turn = page.locator('[data-ega-reply]').first();
  await expect(turn.locator('.ega-answer')).toContainText('Good morning', {
    timeout: 10_000,
  });
  timeline.markStep('body-streamed');

  // Every variety, in the order the model listed them, then the target.
  await expect(turn.locator('[data-ega-meta-item="direction"]')).toHaveText(
    'Arabizi (Levantine) + English → English',
  );
  timeline.markStep('varieties-named');
});
