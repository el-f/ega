/* coverage: options.audit-log.expand-entry */
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

test('clicking entry row opens collapsible body with prompt/response/latency', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);

  await page.evaluate(async () => {
    const entry = {
      id: 'expand-1',
      ts: Date.now(),
      task: 'translate',
      backend: 'anthropic',
      model: 'claude-test',
      systemPrompt: 'You are a translator.',
      userPrompt: 'Translate: hello world',
      response: 'Bonjour le monde',
      latencyMs: 350,
      sourceLang: 'en',
      targetLang: 'fr',
      cacheHit: false,
    };
    await chrome.storage.local.set({ egaAuditLog: { version: 1, entries: [entry] } });
  });
  timeline.markStep('seeded');

  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="diagnostics"]').click();
  timeline.markStep('diagnostics-open');

  const entryLocator = page.locator('[data-ega-audit-entry="expand-1"]');
  await expect(entryLocator).toBeVisible({ timeout: 5_000 });

  await expect(entryLocator.locator('[data-ega-audit-user]')).toHaveCount(0);

  await entryLocator.locator('[data-ega-audit-entry-toggle]').click();
  timeline.markStep('expanded');

  await expect(entryLocator.locator('[data-ega-audit-user]')).toBeVisible({ timeout: 3_000 });
  await expect(entryLocator.locator('[data-ega-audit-user]')).toContainText(
    'Translate: hello world',
  );
  await expect(entryLocator.locator('[data-ega-audit-response]')).toContainText('Bonjour le monde');
  await expect(entryLocator.locator('[data-ega-audit-system]')).toContainText(
    'You are a translator',
  );
});
