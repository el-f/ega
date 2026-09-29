/* coverage: integration.settings-runtime-propagation.theme-change-cross-surface */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../../helpers';
import { createTimeline } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { theme: 'light' });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('theme change in storage flips data-theme on options + sidepanel within one frame', async () => {
  const timeline = createTimeline();
  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await opts.waitForLoadState('domcontentloaded');

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.waitForLoadState('domcontentloaded');

  await expect
    .poll(() => opts.evaluate(() => document.documentElement.dataset['theme']))
    .toBe('light');
  await expect
    .poll(() => sp.evaluate(() => document.documentElement.dataset['theme']))
    .toBe('light');
  timeline.markStep('initial-light');

  await opts.evaluate(async () => {
    const cur = await chrome.storage.local.get('ega.settings');
    const s = (cur as Record<string, Record<string, unknown>>)['ega.settings'] ?? {};
    s['theme'] = 'dark';
    await chrome.storage.local.set({ 'ega.settings': s });
  });
  timeline.markStep('theme-flipped');

  await expect
    .poll(() => opts.evaluate(() => document.documentElement.dataset['theme']), {
      timeout: 5_000,
    })
    .toBe('dark');
  await expect
    .poll(() => sp.evaluate(() => document.documentElement.dataset['theme']), {
      timeout: 5_000,
    })
    .toBe('dark');
  timeline.markStep('cross-surface-dark');
});
