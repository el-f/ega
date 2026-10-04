/* coverage: translation.site-disable.page-translate-blocked */
import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { assertStaysStable, createTimeline } from '../_harness';

const SITE_OFF_MESSAGE = 'Ega is off for this site.';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('page:translateAll on a disabled site toasts and never enters multi-select', async () => {
  const timeline = createTimeline();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    sitePrefs: { [ext.serverUrl]: { disabled: true } },
  });
  mockAnthropic(ext.context, { translation: 'must never be requested' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);
  timeline.markStep('page-ready');

  const sw = ext.context.serviceWorkers()[0];
  if (!sw) throw new Error('[e2e] no service worker');
  await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) throw new Error('no tab');
    await chrome.tabs.sendMessage(tabId, { kind: 'page:translateAll' });
  });
  timeline.markStep('translate-all-sent');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const root = document.querySelector('#ega-shadow-host')?.shadowRoot;
          return root?.querySelector('[data-ega-toast-wrap]')?.textContent.trim() ?? '';
        }),
      { timeout: 5_000 },
    )
    .toContain(SITE_OFF_MESSAGE);
  timeline.markStep('toast-shown');

  await assertStaysStable(async () => await egaTest<boolean>(page, 'msIsActive'), false, {
    windowMs: 2_000,
    message: 'a disabled site must never enter translate-areas mode',
  });
  timeline.markStep('no-multi-select');
});
