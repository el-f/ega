/* coverage: integration.popup-sidepanel-handoff.handoff-then-retry */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../../helpers';
import { createTimeline, sseOk } from '../../_harness';

// The first hit returns a retryable 500 on purpose: it shows Retry with no Settings fix in the way.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    // Left enabled, the 500 rotates to native and surfaces a non-retryable NATIVE_SPAWN_FAIL.
    disabledBackends: ['native'],
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('seeded turn enters error state; Retry re-dispatches and lands success body', async () => {
  const timeline = createTimeline();
  let calls = 0;
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: { type: 'api_error', message: 'server error' } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
      body: sseOk('Recovered after retry.'),
    });
  });

  const popup = await ext.context.newPage();
  await popup.addInitScript(() => {
    const g = globalThis as unknown as {
      chrome?: {
        sidePanel?: { open: (opts: { tabId: number }) => Promise<void> };
        tabs?: { query: (q: unknown) => Promise<Array<{ id: number; url: string }>> };
      };
    };
    if (g.chrome) {
      g.chrome.sidePanel = { open: async () => {} };
      if (g.chrome.tabs) {
        g.chrome.tabs.query = async () => [{ id: 94, url: 'https://example.com/' }];
      }
    }
    (window as unknown as { close: () => void }).close = () => {};
  });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await popup.locator('[data-ega-freeform-textarea]').fill('translate hello to french');
  await popup.getByRole('button', { name: 'Translate', exact: true }).click();
  timeline.markStep('send-clicked');

  await expect
    .poll(
      async () =>
        await popup.evaluate(
          async () =>
            await new Promise<number>((resolve) =>
              chrome.storage.session.get('ega.pendingPopupHandoff', (out) => {
                const m = (out as Record<string, unknown>)['ega.pendingPopupHandoff'];
                resolve(m ? Object.keys(m).length : 0);
              }),
            ),
        ),
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(1);
  await popup.close();

  // Cold-start sidepanel — it drains the handoff on mount.
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await expect(sp.locator('.ega-user-turn').first()).toContainText('translate hello to french', {
    timeout: 10_000,
  });
  timeline.markStep('turn-seeded');

  const retryBtn = sp.locator('[data-ega-retry]');
  await expect(retryBtn).toBeVisible({ timeout: 10_000 });
  timeline.markStep('error-state');

  await retryBtn.click();
  timeline.markStep('retry-clicked');

  await expect(sp.locator('.ega-answer').first()).toContainText('Recovered after retry', {
    timeout: 10_000,
  });
  await expect(sp.locator('[data-ega-retry]')).toHaveCount(0);
  await expect(sp.locator('[data-ega-error]')).toHaveCount(0);

  // The retry must replace the turn, not append a second pair.
  await expect(sp.locator('.ega-user-turn')).toHaveCount(1);
  await expect(sp.locator('[data-ega-reply]')).toHaveCount(1);

  expect(calls).toBeGreaterThanOrEqual(2);
  timeline.markStep('assertions-complete');
});
