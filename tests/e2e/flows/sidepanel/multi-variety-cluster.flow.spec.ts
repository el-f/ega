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

test('multi-variety detection renders a pill cluster on the assistant turn', async () => {
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
  await page.getByRole('button', { name: /^Translate$/ }).click();
  timeline.markStep('send-clicked');

  const turn = page.locator('.ega-assistant-turn').first();
  await expect(turn.locator('.ega-assistant-body')).toContainText('Good morning', {
    timeout: 10_000,
  });
  timeline.markStep('body-streamed');

  // One pill per variety, in the order the model listed them; no single pill beside the cluster.
  const cluster = turn.locator('[data-ega-multi-variety]');
  await expect(cluster.locator('.ega-lang-pill')).toHaveText(['Arabizi — Levantine', 'English']);
  await expect(turn.locator('.ega-lang-pill')).toHaveCount(2);
  timeline.markStep('cluster-visible');
});
