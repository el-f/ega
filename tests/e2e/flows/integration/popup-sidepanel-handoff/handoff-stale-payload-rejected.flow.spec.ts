/* coverage: integration.popup-sidepanel-handoff.handoff-stale-payload-rejected */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../../helpers';
import { createTimeline } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('stale handoff entry is dropped via wall-clock gate; sidepanel mounts clean', async () => {
  const timeline = createTimeline();
  // Every field is valid; only the 90s-old ts trips the 60s age gate in decodeEntry.
  const planter = await ext.context.newPage();
  await planter.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await planter.evaluate(async () => {
    // Map shape, so the read path takes the loop branch, not the bare-payload promotion.
    await chrome.storage.session.set({
      'ega.pendingPopupHandoff': {
        'planted-stale': {
          sourceText: 'stale text',
          task: 'translate',
          tone: 'neutral',
          sourceLang: 'es',
          targetLang: 'en',
          ts: Date.now() - 90_000,
        },
      },
    });
  });
  await planter.close();
  timeline.markStep('handoff-planted');

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await expect(sp.locator('.ega-user-turn')).toHaveCount(0);
  timeline.markStep('clean-mount');
});
