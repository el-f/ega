/* coverage: integration.settings-runtime-propagation.per-site-override-write-survives-reload */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../../helpers';
import { createTimeline } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('valid per-site override survives reload', async () => {
  const timeline = createTimeline();
  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  await opts.evaluate(async () => {
    const cur = await chrome.storage.local.get('ega.settings');
    const s = (cur as Record<string, Record<string, unknown>>)['ega.settings'] ?? {};
    s['sitePrefs'] = {
      'example.com': { disabled: true, defaultLang: 'es' },
    };
    await chrome.storage.local.set({ 'ega.settings': s });
  });
  timeline.markStep('seed');

  await opts.reload();
  await opts.waitForLoadState('domcontentloaded');
  timeline.markStep('reloaded');

  const stored = (await opts.evaluate(
    async () =>
      await new Promise<unknown>((resolve) =>
        chrome.storage.local.get('ega.settings', (out) => resolve(out)),
      ),
  )) as { 'ega.settings'?: { sitePrefs?: Record<string, Record<string, unknown>> } };
  const pref = stored['ega.settings']?.sitePrefs?.['example.com'] ?? {};
  expect(pref['disabled']).toBe(true);
  expect(pref['defaultLang']).toBe('es');
});
