/* coverage: templating.describe-change.apply-blocked-when-busy */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test-busy-guard',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('second Apply click while busy is a no-op — no duplicate rule created', async () => {
  const timeline = createTimeline();

  let releaseFulfill: () => void = () => {};
  const fulfillReady = new Promise<void>((resolve) => {
    releaseFulfill = resolve;
  });

  const replyJson = JSON.stringify({
    category: 'always',
    body: 'Busy-guard test rule — must appear exactly once.',
    scope: { tasks: [] },
  });

  // Hold the response so the busy window is observable.
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await fulfillReady;
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        id: 'msg_busy_guard',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: replyJson }],
        stop_reason: 'end_turn',
      }),
    });
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="global"]').click();
  const header = page.locator('[data-ega-describe-header][data-ega-describe-scope="global"]');
  await expect(header).toBeVisible({ timeout: 10_000 });
  await header.locator('summary').click();

  const input = header.locator('[data-ega-describe-input]').first();
  await expect(input).toBeVisible({ timeout: 10_000 });

  await input.fill('busy guard test input');
  const applyBtn = header.locator('[data-ega-describe-apply]').first();
  await applyBtn.click();
  timeline.markStep('first-apply-clicked');

  // Busy state: input disabled, busy-label visible.
  const busyLabel = page.locator('[data-ega-describe-your-change] .busy-label').first();
  await expect(busyLabel).toBeVisible({ timeout: 5_000 });
  timeline.markStep('busy-visible');

  // Second click — Apply button is loading (disabled) while busy.
  await applyBtn.click({ force: true });
  timeline.markStep('second-apply-clicked');

  releaseFulfill();

  // Rule should appear exactly once in storage.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return (s?.advanced.rules ?? []).filter(
          (r) => r.body === 'Busy-guard test rule — must appear exactly once.',
        ).length;
      },
      { timeout: 20_000 },
    )
    .toBe(1);
  timeline.markStep('single-rule-in-storage');
});
