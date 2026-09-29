/* coverage: integration.popup-sidepanel-handoff.handoff-stale-payload-rejected */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../../helpers';
import { plantStaleHandoff } from '../../fixtures/handoff-stale';
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
  // Every field is valid; only the fixture's ts (90s old) trips the 60s age gate.
  await plantStaleHandoff(ext.context, ext.extensionId, {
    sourceText: 'stale text',
    sourceLang: 'es',
  });
  timeline.markStep('handoff-planted');

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await expect(sp.locator('.ega-user-turn')).toHaveCount(0);
  timeline.markStep('clean-mount');
});
