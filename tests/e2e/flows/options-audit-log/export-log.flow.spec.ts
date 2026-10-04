/* coverage: options.audit-log.export-log */
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

test('Export-as-JSON triggers a download with the audit-log filename pattern', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  await page.evaluate(async () => {
    const entry = {
      id: 'flow-export-1',
      ts: Date.now(),
      task: 'translate',
      backend: 'openai',
      model: 'gpt-test',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      response: 'res',
      latencyMs: 211,
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
  await expect(page.locator('[data-ega-audit-export]')).toBeEnabled({ timeout: 5_000 });

  const downloadPromise = page.waitForEvent('download', { timeout: 5_000 });
  await page.locator('[data-ega-audit-export]').click();
  const dl = await downloadPromise;
  expect(dl.suggestedFilename()).toMatch(/^ega-audit-log-.+\.json$/);
});
