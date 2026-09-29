import { test, expect } from '@playwright/test';
import { launchExtension, waitForServiceWorker, type ExtensionHandle } from './helpers';

// Loose first-paint ceilings (400/600 ms): they catch a heavy top-level import without flaking on CI.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await waitForServiceWorker(ext.context, ext.extensionId);
});

test.afterEach(async () => {
  await ext.close();
});

test('popup first-paint under budget', async () => {
  const p = await ext.context.newPage();
  const t0 = Date.now();
  await p.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await p.waitForSelector('header', { timeout: 2_000 });
  const elapsed = Date.now() - t0;
  console.log(`[perf] popup first-paint: ${elapsed}ms`);
  expect(elapsed).toBeLessThan(400);
});

test('side-panel first-paint under budget', async () => {
  const p = await ext.context.newPage();
  const t0 = Date.now();
  await p.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await p.waitForSelector('header', { timeout: 2_000 });
  const elapsed = Date.now() - t0;
  console.log(`[perf] sidepanel first-paint: ${elapsed}ms`);
  expect(elapsed).toBeLessThan(600);
});
