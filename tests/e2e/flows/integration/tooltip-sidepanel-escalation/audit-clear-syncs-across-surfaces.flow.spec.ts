/* coverage: integration.tooltip-sidepanel-escalation.audit-clear-syncs-across-surfaces */
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

test('Clear audit log empties storage.local.egaAuditLog; subsequent reads from any surface see empty', async () => {
  const timeline = createTimeline();
  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  await opts.evaluate(async () => {
    const entries = [
      {
        id: 'seed-1',
        ts: Date.now(),
        task: 'translate',
        backend: 'anthropic',
        model: 'claude-test',
        latencyMs: 200,
        sourceLang: 'auto',
        targetLang: 'en',
        systemPrompt: '',
        userPrompt: 'hello',
        response: 'world',
        cacheHit: false,
      },
      {
        id: 'seed-2',
        ts: Date.now(),
        task: 'translate',
        backend: 'anthropic',
        model: 'claude-test',
        latencyMs: 250,
        sourceLang: 'auto',
        targetLang: 'en',
        systemPrompt: '',
        userPrompt: 'foo',
        response: 'bar',
        cacheHit: false,
      },
    ];
    await chrome.storage.local.set({ egaAuditLog: { version: 1, entries } });
  });
  timeline.markStep('seeded');

  await opts.locator('#tab-advanced').click();
  await opts.locator('[data-ega-subtab="diagnostics"]').click();
  await expect(opts.locator('[data-ega-audit-entry]')).toHaveCount(2, { timeout: 5_000 });
  timeline.markStep('rendered-before-clear');

  await opts.locator('[data-ega-audit-clear]').click();
  // FocusTrap adds an outer role="dialog", so scope to the inner `.ega-dialog`.
  const dialog = opts.locator('.ega-dialog').filter({ hasText: 'Clear recent requests?' });
  await dialog.waitFor({ state: 'visible', timeout: 5_000 });
  await dialog.locator('button[data-variant="danger"]').click();
  timeline.markStep('clear-confirmed');

  await expect
    .poll(
      async () =>
        await opts.evaluate(
          async () =>
            await new Promise<unknown>((resolve) =>
              chrome.storage.local.get('egaAuditLog', (out) => {
                const log = (out as Record<string, unknown>)['egaAuditLog'];
                resolve(log ?? null);
              }),
            ),
        ),
      { timeout: 5_000 },
    )
    .toBeNull();

  await expect(opts.locator('[data-ega-audit-entry]')).toHaveCount(0);
  timeline.markStep('post-clear-empty');
});
