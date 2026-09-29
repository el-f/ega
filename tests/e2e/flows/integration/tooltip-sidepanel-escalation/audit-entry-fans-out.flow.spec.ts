/* coverage: integration.tooltip-sidepanel-escalation.audit-entry-fans-out */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  suppressSidePanelOpen,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../../helpers';
import { createTimeline, waitForVisibleText } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await suppressSidePanelOpen(ext.context, ext.extensionId);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('tooltip translate appends an audit entry visible in options audit-log panel', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'Welcome friend.' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  await waitForVisibleText(page, '.tooltip .body', 'Welcome', { timeoutMs: 10_000 });
  timeline.markStep('tooltip-translated');

  // chrome.storage is only reachable from an extension origin, so read it from the options page.
  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await expect
    .poll(
      async () =>
        await opts.evaluate(
          async () =>
            await new Promise<number>((resolve) =>
              chrome.storage.local.get('egaAuditLog', (out) => {
                const log = (out as Record<string, unknown>)['egaAuditLog'] as
                  { entries?: unknown[] } | undefined;
                resolve(log?.entries?.length ?? 0);
              }),
            ),
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1);
  timeline.markStep('audit-written');

  await opts.locator('#tab-advanced').click();
  await opts.locator('[data-ega-subtab="diagnostics"]').click();
  await expect(opts.locator('[data-ega-request-audit-log]')).toBeVisible({ timeout: 5_000 });
  await expect(opts.locator('[data-ega-audit-entry]').first()).toBeVisible({ timeout: 5_000 });
  timeline.markStep('audit-rendered');
});
