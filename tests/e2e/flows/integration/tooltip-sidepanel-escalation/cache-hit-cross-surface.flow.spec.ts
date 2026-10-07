/* coverage: integration.tooltip-sidepanel-escalation.cache-hit-cross-surface */
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
    anthropicApiKey: 'sk-test',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    cacheEnabled: true,
    // These three make the sidepanel build the same cache key the tooltip built.
    contextEnabled: false,
    defaultLang: 'arabizi',
    defaultTargetLang: 'en',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('sidepanel turn for the same source text hits the cache populated by the tooltip', async () => {
  const timeline = createTimeline();
  const anth = mockAnthropic(ext.context, { translation: 'Welcome friend.' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  await waitForVisibleText(page, '.tooltip .body', 'Welcome', { timeoutMs: 10_000 });
  expect(anth.calls()).toBe(1);
  timeline.markStep('tooltip-translated');

  // The sidepanel must send the exact same source text.
  const sourceText = await page.evaluate(
    () => document.getElementById('arabizi')?.textContent.trim() ?? '',
  );
  expect(sourceText.length).toBeGreaterThan(0);

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await sp.locator('#sp-text').fill(sourceText);
  await sp.locator('#sp-text').press('Enter');

  await expect(sp.locator('.ega-answer').first()).toContainText('Welcome', {
    timeout: 10_000,
  });
  timeline.markStep('sidepanel-cache-hit');

  expect(anth.calls()).toBe(1);
});
