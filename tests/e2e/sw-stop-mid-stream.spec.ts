import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  onlyBackends,
  resetRoutes,
  seedSettings,
  type ExtensionHandle,
} from './helpers';
import { stuckTimeoutMs } from '../../src/shared/stuck-timeout';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    ...onlyBackends('anthropic'),
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('a worker stopped mid-stream turns the side-panel turn into an error, and Try again recovers', async () => {
  // Held long enough that only the worker's death can end this request.
  mockAnthropic(ext.context, { translation: 'Never arrives', delayMs: 60_000, times: 1 });
  const page = await ext.context.newPage();
  // The panel's stall guard is a page timer; the fake clock lets the test jump past it.
  await page.clock.install();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').fill('hola');
  await page.locator('#sp-text').press('Enter');
  await expect(page.locator('.ega-skeleton')).toBeVisible();

  const prefix = `chrome-extension://${ext.extensionId}/`;
  const cdp = await ext.context.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  const stopped = new Promise<void>((resolve) => {
    cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
      if (versions.some((v) => v.scriptURL.startsWith(prefix) && v.runningStatus === 'stopped')) {
        resolve();
      }
    });
  });
  await cdp.send('ServiceWorker.stopAllWorkers');
  await stopped;

  // No terminal chunk can come now; the turn must not sit on "Translating…" for ever.
  await page.clock.fastForward(stuckTimeoutMs(null) + 1_000);
  const error = page.locator('[data-ega-error]');
  await expect(error).toContainText('No answer in time');
  // The panel's own reason sits under Details, like every backend message.
  await error.locator('[data-ega-error-details]').click();
  await expect(error).toContainText('The reply stopped arriving');
  await expect(page.locator('.ega-skeleton')).toHaveCount(0);

  // The next message restarts the worker, and the same turn recovers.
  await resetRoutes(ext.context);
  mockAnthropic(ext.context, { translation: 'Back again' });
  await page.locator('[data-ega-retry]').click();
  await expect(page.locator('[data-ega-reply]').last()).toContainText('Back again', {
    timeout: 15_000,
  });
  await expect(page.locator('[data-ega-error]')).toHaveCount(0);
  await expect(page.locator('.ega-user-turn')).toHaveCount(1);
});
