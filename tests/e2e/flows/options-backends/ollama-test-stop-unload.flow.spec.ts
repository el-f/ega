/* coverage: options.backends.ollama-test-stop-unload */
import { test, expect } from '@playwright/test';
import { launchExtension, onlyBackends, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

const BASE = 'http://localhost:11434';
const MODEL = 'gemma4:26b';
const CORS = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    ...onlyBackends('ollama'),
    model: { ollama: MODEL },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Ollama Test now shows the model load, Stop drops it, and Unload frees a loaded model', async () => {
  const timeline = createTimeline();
  let loaded = false;
  let releaseChat: () => void = () => {};
  const unloads: unknown[] = [];
  // Every path is routed, so a real Ollama on the machine never answers.
  await ext.context.route(`${BASE}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (path === '/api/tags') {
      return route.fulfill({ headers: CORS, body: JSON.stringify({ models: [{ name: MODEL }] }) });
    }
    if (path === '/api/ps') {
      const models = loaded ? [{ name: MODEL, size: 16.5e9, size_vram: 4e9 }] : [];
      return route.fulfill({ headers: CORS, body: JSON.stringify({ models }) });
    }
    if (path === '/api/chat') {
      // Holds like a model load until the page drops the request.
      await new Promise<void>((r) => (releaseChat = r));
      return route.abort().catch(() => {});
    }
    if (path === '/api/generate') {
      unloads.push(req.postDataJSON());
      loaded = false;
      return route.fulfill({ headers: CORS, body: '{}' });
    }
    return route.fulfill({ status: 404, headers: CORS, body: '' });
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-backends').click();
  const card = page.locator('details[data-backend-id="ollama"]');
  await expect(card).toBeVisible({ timeout: 5_000 });
  if (!(await card.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await card.locator('summary.cc-summary').click();
  }
  timeline.markStep('card-open');

  const testBtn = page.getByTestId('backend-card-test-ollama');
  await testBtn.click();
  await expect(card.locator('[data-ega-test-progress]')).toHaveText(
    `Loading ${MODEL} into memory...`,
    { timeout: 10_000 },
  );
  await expect(card.locator('[data-ega-test-clock]')).toHaveText(/^0:0\d$/);
  await expect(testBtn).toHaveText('Stop');
  timeline.markStep('loading-visible');

  await testBtn.click();
  await expect(card.locator('[data-ega-test-note]')).toHaveText('Test stopped.', {
    timeout: 5_000,
  });
  await expect(testBtn).toHaveText('Test now');
  await expect(testBtn).toBeFocused();
  releaseChat();
  timeline.markStep('stopped');

  // A translation elsewhere can load the model; the card reads it on its next probe.
  loaded = true;
  await page.reload();
  await page.locator('#tab-backends').click();
  if (!(await card.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await card.locator('summary.cc-summary').click();
  }
  await expect(card.locator('[data-ega-ollama-memory]')).toHaveText(
    'Loaded: 4.0 GB on the GPU, 13 GB in RAM',
    { timeout: 10_000 },
  );
  await page.getByTestId('backend-card-unload-ollama').click();
  await expect(card.locator('[data-ega-ollama-memory]')).toHaveCount(0, { timeout: 5_000 });
  expect(unloads).toEqual([{ model: MODEL, keep_alive: 0 }]);
  timeline.markStep('unloaded');

  timeline.report();
});
