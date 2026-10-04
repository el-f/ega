/* coverage: options.audit-log.entry-renders */
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

test('seeded audit-log entry renders under Diagnostics sub-tab', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  // The AuditEntry predicate needs systemPrompt/userPrompt/response on top of the routing fields.
  await page.evaluate(async () => {
    const entry = {
      id: 'flow-test-1',
      ts: Date.now(),
      task: 'translate',
      backend: 'anthropic',
      model: 'claude-test',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      response: 'res',
      latencyMs: 420,
      sourceLang: 'auto',
      targetLang: 'en',
      cacheHit: false,
    };
    await chrome.storage.local.set({
      egaAuditLog: { version: 1, entries: [entry] },
    });
  });
  timeline.markStep('seeded');

  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="diagnostics"]').click();
  timeline.markStep('diagnostics-open');

  await expect(page.locator('[data-ega-request-audit-log]')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-ega-audit-entry="flow-test-1"]')).toBeVisible({
    timeout: 5_000,
  });
});
