/* coverage: integration.tooltip-sidepanel-escalation.tooltip-error-toast-bus */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  suppressSidePanelOpen,
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
  await ext.context.route('https://api.anthropic.com/v1/messages', (route) =>
    route.fulfill({ status: 500, body: '{"error":{"message":"upstream"}}' }),
  );
});

test.afterEach(async () => {
  await ext.close();
});

test('audit-error broadcast surfaces a danger toast on the sidepanel', async () => {
  // Mount the sidepanel first so its audit:append listener is live before the translate fails.
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.waitForLoadState('domcontentloaded');

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');

  // sonner renders the danger variant as data-type="error".
  await expect
    .poll(
      async () =>
        await sp.evaluate(() => {
          const toasts = document.querySelectorAll('[data-sonner-toast]');
          for (const t of toasts) {
            const type = (t as HTMLElement).getAttribute('data-type');
            if (type === 'error') return true;
          }
          return false;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
});
