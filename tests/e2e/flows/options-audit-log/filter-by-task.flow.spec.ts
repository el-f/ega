/* coverage: options.audit-log.filter-by-task */
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

test('task filter narrows the audit-log list and surfaces match count', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  await page.evaluate(async () => {
    const entries = [
      {
        id: 'f-a',
        ts: Date.now() - 3,
        task: 'translate',
        backend: 'anthropic',
        model: 'claude-test',
        latencyMs: 100,
        sourceLang: 'auto',
        targetLang: 'en',
        cacheHit: false,
        userPrompt: 'one',
        systemPrompt: 'sys',
        response: 'r1',
      },
      {
        id: 'f-b',
        ts: Date.now() - 2,
        task: 'explain',
        backend: 'anthropic',
        model: 'claude-test',
        latencyMs: 120,
        sourceLang: 'auto',
        targetLang: 'en',
        cacheHit: false,
        userPrompt: 'two',
        systemPrompt: 'sys',
        response: 'r2',
      },
      {
        id: 'f-c',
        ts: Date.now() - 1,
        task: 'translate',
        backend: 'gemini',
        model: 'gemini-test',
        latencyMs: 200,
        sourceLang: 'auto',
        targetLang: 'en',
        cacheHit: false,
        userPrompt: 'three',
        systemPrompt: 'sys',
        response: 'r3',
      },
    ];
    await chrome.storage.local.set({ egaAuditLog: { version: 1, entries } });
  });
  timeline.markStep('seeded');

  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="diagnostics"]').click();
  timeline.markStep('diagnostics-open');

  await expect(page.locator('[data-ega-audit-entry="f-a"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-ega-audit-entry="f-b"]')).toBeVisible();
  await expect(page.locator('[data-ega-audit-entry="f-c"]')).toBeVisible();

  await page.locator('[data-ega-audit-filter-task]').selectOption('explain');
  timeline.markStep('filter-applied');

  await expect(page.locator('[data-ega-audit-entry="f-a"]')).toHaveCount(0);
  await expect(page.locator('[data-ega-audit-entry="f-b"]')).toBeVisible();
  await expect(page.locator('[data-ega-audit-entry="f-c"]')).toHaveCount(0);
  await expect(page.locator('[data-ega-audit-match-count]')).toHaveText(/1\s+match\b/);
});
