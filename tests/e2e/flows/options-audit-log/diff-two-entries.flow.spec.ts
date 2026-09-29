/* coverage: options.audit-log.diff-two-entries */
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

test('Compare on two entries opens AuditDiffModal with side-by-side diff', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  await page.evaluate(async () => {
    const entries = [
      {
        id: 'diff-a',
        ts: Date.now() - 2,
        task: 'translate',
        backend: 'anthropic',
        model: 'claude-test',
        systemPrompt: 'system A',
        userPrompt: 'prompt A',
        response: 'response A',
        latencyMs: 100,
        sourceLang: 'en',
        targetLang: 'fr',
        cacheHit: false,
      },
      {
        id: 'diff-b',
        ts: Date.now() - 1,
        task: 'reword',
        backend: 'gemini',
        model: 'gemini-test',
        systemPrompt: 'system B',
        userPrompt: 'prompt B',
        response: 'response B',
        latencyMs: 200,
        sourceLang: 'en',
        targetLang: 'fr',
        cacheHit: false,
      },
    ];
    await chrome.storage.local.set({ egaAuditLog: { version: 1, entries } });
  });
  timeline.markStep('seeded');

  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="diagnostics"]').click();
  timeline.markStep('diagnostics-open');

  await expect(page.locator('[data-ega-audit-entry="diff-a"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-ega-audit-entry="diff-b"]')).toBeVisible();

  await page.locator('[data-ega-audit-compare="diff-a"]').click();
  timeline.markStep('compare-a-clicked');

  await expect(page.locator('[data-ega-audit-compare-prompt]')).toBeVisible({ timeout: 3_000 });

  await page.locator('[data-ega-audit-compare="diff-b"]').click();
  timeline.markStep('compare-b-clicked');

  await expect(page.locator('[data-ega-audit-diff-modal]')).toBeVisible({ timeout: 5_000 });

  await expect(page.locator('[data-ega-diff-meta-left]')).toBeVisible();
  await expect(page.locator('[data-ega-diff-meta-right]')).toBeVisible();
  await expect(page.locator('[data-ega-diff-user-left]')).toContainText('prompt A');
  await expect(page.locator('[data-ega-diff-user-right]')).toContainText('prompt B');
  await expect(page.locator('[data-ega-diff-response-left]')).toContainText('response A');
  await expect(page.locator('[data-ega-diff-response-right]')).toContainText('response B');
});
