/* coverage: options.audit-log.filter-by-backend */
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

test('backend filter dropdown narrows list to matching backend', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  await page.evaluate(async () => {
    const entries = [
      {
        id: 'be-ant',
        ts: Date.now() - 2,
        task: 'translate',
        backend: 'anthropic',
        model: 'claude-test',
        systemPrompt: 'sys',
        userPrompt: 'hello',
        response: 'r1',
        latencyMs: 100,
        sourceLang: 'auto',
        targetLang: 'en',
        cacheHit: false,
      },
      {
        id: 'be-gem',
        ts: Date.now() - 1,
        task: 'translate',
        backend: 'gemini',
        model: 'gemini-test',
        systemPrompt: 'sys',
        userPrompt: 'world',
        response: 'r2',
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

  await expect(page.locator('[data-ega-audit-entry="be-ant"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-ega-audit-entry="be-gem"]')).toBeVisible();

  await page.locator('[data-ega-audit-filter-backend]').selectOption('anthropic');
  timeline.markStep('filter-applied');

  await expect(page.locator('[data-ega-audit-entry="be-ant"]')).toBeVisible({ timeout: 3_000 });
  await expect(page.locator('[data-ega-audit-entry="be-gem"]')).toHaveCount(0);
  await expect(page.locator('[data-ega-audit-match-count]')).toHaveText(/1\s+match\b/);
});
