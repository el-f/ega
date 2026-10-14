/* coverage: options.audit-log.filter-by-status */
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

test('status filter shows only error entries then only cache entries', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  await page.evaluate(async () => {
    const now = Date.now();
    const entries = [
      {
        id: 'st-ok',
        ts: now - 3,
        task: 'translate',
        backend: 'anthropic',
        model: 'claude-test',
        systemPrompt: 'sys',
        userPrompt: 'ok prompt',
        response: 'ok response',
        latencyMs: 100,
        sourceLang: 'auto',
        targetLang: 'en',
        cacheHit: false,
      },
      {
        id: 'st-err',
        ts: now - 2,
        task: 'translate',
        backend: 'anthropic',
        model: 'claude-test',
        systemPrompt: 'sys',
        userPrompt: 'error prompt',
        response: '',
        latencyMs: 50,
        sourceLang: 'auto',
        targetLang: 'en',
        cacheHit: false,
        error: { code: 'ERR_TEST', message: 'test error' },
      },
      {
        id: 'st-cache',
        ts: now - 1,
        task: 'translate',
        backend: 'anthropic',
        model: 'claude-test',
        systemPrompt: 'sys',
        userPrompt: 'cached prompt',
        response: 'cached response',
        latencyMs: 5,
        sourceLang: 'auto',
        targetLang: 'en',
        cacheHit: true,
      },
    ];
    await chrome.storage.local.set({ egaAuditLog: { version: 1, entries } });
  });
  timeline.markStep('seeded');

  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="diagnostics"]').click();
  timeline.markStep('diagnostics-open');

  await expect(page.locator('[data-ega-audit-entry="st-ok"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-ega-audit-entry="st-err"]')).toBeVisible();
  await expect(page.locator('[data-ega-audit-entry="st-cache"]')).toBeVisible();

  // Filter to error status.
  await page.locator('[data-ega-audit-filter-status]').selectOption('error');
  timeline.markStep('error-filter-applied');

  await expect(page.locator('[data-ega-audit-entry="st-err"]')).toBeVisible({ timeout: 3_000 });
  await expect(page.locator('[data-ega-audit-entry="st-ok"]')).toHaveCount(0);
  await expect(page.locator('[data-ega-audit-entry="st-cache"]')).toHaveCount(0);
  await expect(page.locator('[data-ega-audit-match-count]')).toHaveText(/1\s+match\b/);

  // Switch to cache status.
  await page.locator('[data-ega-audit-filter-status]').selectOption('cache');
  timeline.markStep('cache-filter-applied');

  await expect(page.locator('[data-ega-audit-entry="st-cache"]')).toBeVisible({ timeout: 3_000 });
  await expect(page.locator('[data-ega-audit-entry="st-ok"]')).toHaveCount(0);
  await expect(page.locator('[data-ega-audit-entry="st-err"]')).toHaveCount(0);
  await expect(page.locator('[data-ega-audit-match-count]')).toHaveText(/1\s+match\b/);
});
