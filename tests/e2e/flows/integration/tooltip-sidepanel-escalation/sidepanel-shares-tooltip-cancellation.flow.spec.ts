/* coverage: integration.tooltip-sidepanel-escalation.sidepanel-shares-tooltip-cancellation */
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

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await suppressSidePanelOpen(ext.context, ext.extensionId);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    backendOrder: ['anthropic', 'openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
    disabledBackends: ['openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('sidepanel Cancel-all aborts an in-flight tooltip translate', async () => {
  // Slow mock so Cancel-all lands before the translate resolves on its own.
  mockAnthropic(ext.context, { translation: 'should-not-render', delayMs: 15_000 });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot ?? document;
          return root.querySelector('.tooltip') !== null;
        }),
      { timeout: 5_000 },
    )
    .toBe(true);

  // Panel mounts after the page: it follows the active origin, and a mid-test switch clears its turn.
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  await sp.locator('#sp-text').fill('marhaba');
  await sp.locator('#sp-text').press('Enter');

  // Cancel-all is offered only while the panel has its own translate in flight; the cancel it sends is global.
  await sp.locator('[data-ega-header-more]').click();
  await sp.locator('[data-ega-cancel-all]').click();

  // data-ega-retry renders only in the error / no-body state.
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const host = document.querySelector('#ega-shadow-host');
          const root = (host as HTMLElement | null)?.shadowRoot ?? document;
          return root.querySelector('[data-ega-retry]') !== null;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
});
