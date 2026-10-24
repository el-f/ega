/* coverage: translation.sidepanel.backend-pill */
import { test, expect } from '@playwright/test';
import { launchExtension, onlyBackends, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline, expectSameWidth } from '../_harness';

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

test('sidepanel header chip renders the active backend name', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  timeline.markStep('sidepanel-opened');

  const chip = page.locator('.active-backend-chip');
  await expect(chip).toBeVisible({ timeout: 5_000 });
  timeline.markStep('chip-visible');

  // The chip waits on settings before it paints, so poll for the resolved manifest name.
  await expect(chip.locator('.chip-name')).toHaveText('Anthropic', { timeout: 5_000 });
  timeline.markStep('label-resolved');

  // The chip opens the backends in the order Ega tries them, each with a plain status.
  await chip.click();
  const row = page.locator('[data-ega-backend-row="anthropic"]');
  await expect(row).toContainText('In use');
  await expect(page.getByText('Ega tries them in this order.')).toBeVisible();
  timeline.markStep('popover-open');
});

test('the chip and the backend rows keep their width when the probe lands', async () => {
  // Ollama sits ahead of the keyed Anthropic, so the probe decides the name; Local server is refused, so its row gains a fix.
  await seedSettings(ext.context, ext.extensionId, {
    ...onlyBackends('ollama', 'localserver', 'anthropic'),
    localBackendTimeoutMs: 5_000,
  });
  let releaseTags: () => void = () => {};
  const tagsHeld = new Promise<void>((r) => (releaseTags = r));
  // Every Ollama path is routed and held, so a real Ollama on the machine never answers.
  await ext.context.route('http://localhost:11434/**', async (route) => {
    await tagsHeld;
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (new URL(route.request().url()).pathname !== '/api/tags') {
      return route.fulfill({ status: 404, headers, body: '' });
    }
    return route.fulfill({ headers, body: JSON.stringify({ models: [{ name: 'gemma4:26b' }] }) });
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  const chip = page.locator('.active-backend-chip');
  // Until the probe answers, the keyed backend names the chip.
  await expect(chip.locator('.chip-name')).toHaveText('Anthropic', { timeout: 5_000 });
  await chip.click();
  const localRow = page.locator('[data-ega-backend-row="localserver"]');
  await expect(localRow.locator('.chain-status')).toHaveText('Checking…');

  // The chip holds every name the probe can land on, and each row holds the widest fix (R63).
  await expectSameWidth(
    chip,
    () =>
      expectSameWidth(
        localRow.locator('.chain-text'),
        async () => {
          releaseTags();
          await expect(chip.locator('.chip-name')).toHaveText('Ollama', { timeout: 5_000 });
          await expect(
            localRow.getByRole('button', { name: 'How to start: Local server' }),
          ).toBeVisible();
        },
        'Local server row: Checking... -> Not running',
      ),
    'chip: Anthropic -> Ollama',
  );
});
