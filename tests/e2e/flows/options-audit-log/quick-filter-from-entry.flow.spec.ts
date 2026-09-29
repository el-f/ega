/* coverage: options.audit-log.quick-filter-from-entry */
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

test('task quick-filter chip applies filter and narrows list', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  await page.evaluate(async () => {
    const entries = [
      {
        id: 'qf-translate',
        ts: Date.now() - 2,
        task: 'translate',
        backend: 'anthropic',
        model: 'claude-test',
        systemPrompt: 'sys',
        userPrompt: 'translate me',
        response: 'translated',
        latencyMs: 100,
        sourceLang: 'auto',
        targetLang: 'en',
        cacheHit: false,
      },
      {
        id: 'qf-explain',
        ts: Date.now() - 1,
        task: 'explain',
        backend: 'anthropic',
        model: 'claude-test',
        systemPrompt: 'sys',
        userPrompt: 'explain me',
        response: 'explained',
        latencyMs: 150,
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

  await expect(page.locator('[data-ega-audit-entry="qf-translate"]')).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.locator('[data-ega-audit-entry="qf-explain"]')).toBeVisible();

  const translateEntry = page.locator('[data-ega-audit-entry="qf-translate"]');
  await translateEntry.locator('[data-ega-audit-quickfilter="task"]').click();
  timeline.markStep('quick-filter-clicked');

  await expect(page.locator('[data-ega-audit-entry="qf-explain"]')).toHaveCount(0, {
    timeout: 3_000,
  });
  await expect(page.locator('[data-ega-audit-entry="qf-translate"]')).toBeVisible();

  await expect(page.locator('[data-ega-audit-filter-task]')).toHaveValue('translate');

  // applyQuickFilter scrolls to this row, so it must stay in the DOM.
  await expect(page.locator('[data-ega-audit-filters]')).toBeAttached();
});
