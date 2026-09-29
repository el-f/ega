/* coverage: options.audit-log.clear-log */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Clear button + confirm removes all entries from storage and empties list', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  await page.evaluate(async () => {
    const entries = [
      {
        id: 'clr-1',
        ts: Date.now() - 1,
        task: 'translate',
        backend: 'anthropic',
        model: 'claude-test',
        systemPrompt: 'sys',
        userPrompt: 'hello',
        response: 'world',
        latencyMs: 100,
        sourceLang: 'auto',
        targetLang: 'en',
        cacheHit: false,
      },
      {
        id: 'clr-2',
        ts: Date.now(),
        task: 'explain',
        backend: 'gemini',
        model: 'gemini-test',
        systemPrompt: 'sys',
        userPrompt: 'foo',
        response: 'bar',
        latencyMs: 200,
        sourceLang: 'auto',
        targetLang: 'en',
        cacheHit: false,
      },
    ];
    await chrome.storage.local.set({ egaAuditLog: { version: 1, entries } });
  });
  timeline.markStep('seeded');

  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="diagnostics"]').click();
  timeline.markStep('diagnostics-open');

  await expect(page.locator('[data-ega-audit-entry="clr-1"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-ega-audit-entry="clr-2"]')).toBeVisible();

  await page.locator('[data-ega-audit-clear]').click();
  timeline.markStep('clear-clicked');

  // `.last()` picks the dialog's confirm button, not the toolbar one that opened it.
  const confirmBtn = page.getByRole('button', { name: 'Clear' }).last();
  await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
  await confirmBtn.click();
  timeline.markStep('confirmed');

  await expect(page.locator('[data-ega-audit-entry="clr-1"]')).toHaveCount(0, { timeout: 5_000 });
  await expect(page.locator('[data-ega-audit-entry="clr-2"]')).toHaveCount(0);

  // clearAuditLog removes the key, so it must read back as undefined, not an empty log.
  const stored = await page.evaluate(async () => {
    const out = await chrome.storage.local.get('egaAuditLog');
    return (out as Record<string, unknown>)['egaAuditLog'];
  });
  expect(stored).toBeUndefined();
});
